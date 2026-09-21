import { Prisma, TransactionStatus, WeighmentKind } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { parsePagination } from "../../domain/pagination.js";
import { formatReferenceNumber, parseReferenceSequence, referencePrefix } from "../../domain/referenceNumber.js";
import { assertTransactionMutable } from "../../domain/transactionMutability.js";
import { canTransition } from "../../domain/transactionState.js";
import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import { mergeTimeline } from "../../domain/transactionTimeline.js";
import { assertCanRecordFirstWeighment } from "../../domain/workflowEngine.js";
import { assertWeightWithinLimits, parseWeightKg } from "../../domain/weight.js";
import { HttpError } from "../../lib/httpError.js";
import { assertOrganizationOperational, assertSiteAcceptsNewWork, organizationStatusOf } from "../../domain/tenancy/lifecycle.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { ensureRequiredApproval } from "../approvals/engine.js";
import { emitPendingApprovalRequired } from "../notifications/hooks.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteWhere, accessibleWeighbridgeWhere, assertRequestedSite } from "../shared/siteScope.js";
import { getAccessibleWeighbridge } from "../weighbridges/service.js";
import { toPublicTransaction, transactionInclude, transactionProgress, type PublicTransaction } from "./mapper.js";
import { suggestTransactionMaterial } from "./materialWorkflow.js";
import type {
  CreateTransactionInput,
  IdentifyTransactionInput,
  RecordWeighmentInput,
} from "./validators.js";
import { parseOptionalDate, parseStatusFilter } from "./validators.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function listTransactions(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicTransaction[]; page: number; pageSize: number; total: number }> {
  const pagination = parsePagination(query);
  const status = parseStatusFilter(query.status);
  const from = parseOptionalDate(query.from, "from");
  const to = parseOptionalDate(query.to, "to");
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const siteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;

  if (siteId) {
    await assertRequestedSite(actor, siteId);
  }

  const where: Prisma.TransactionWhereInput = {
    organizationId: actor.user.organizationId,
    ...accessibleSiteWhere(actor),
    ...accessibleWeighbridgeWhere(actor),
  };

  if (status) {
    where.status = status;
  }

  if (siteId) {
    where.siteId = siteId;
  }

  if (from || to) {
    where.arrivedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  if (q !== "") {
    const registration = normalizeRegistrationNumber(q);
    where.OR = [
      { referenceNumber: { contains: q.toUpperCase() } },
      ...(registration === ""
        ? []
        : [{ vehicle: { registrationNumber: { contains: registration } } }]),
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { arrivedAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  const items = rows.map((record) => toPublicTransaction(record));

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getTransaction(actor: ActorContext, id: string): Promise<PublicTransaction> {
  const record = await prisma.transaction.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });

  if (!record) {
    throw new HttpError(404, "Transaction not found");
  }

  assertSiteAccess(actor.user, record.siteId);
  await prisma.$transaction(async (tx) => {
    await ensureRequiredApproval(tx, actor, record);
  });
  await emitPendingApprovalRequired(actor, record.id);
  const synced = await prisma.transaction.findFirst({
    where: { id: record.id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });
  if (!synced) {
    throw new HttpError(404, "Transaction not found");
  }
  const suggestion = await suggestTransactionMaterial(actor, synced.id);
  return toPublicTransaction(synced, suggestion);
}

export async function createTransaction(
  actor: ActorContext,
  input: CreateTransactionInput,
): Promise<PublicTransaction> {
  assertOrganizationOperational(organizationStatusOf(actor.user.organization.status));
  const weighbridge = await getAccessibleWeighbridge(actor, input.weighbridgeId);
  if (!weighbridge.isActive) {
    throw new HttpError(400, "This weighbridge is offline");
  }

  const siteId = input.siteId ?? weighbridge.siteId;
  if (siteId !== weighbridge.siteId) {
    throw new HttpError(400, "Weighbridge does not belong to that site");
  }

  assertSiteAccess(actor.user, siteId);

  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: actor.user.organizationId, deletedAt: null },
    select: { status: true },
  });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  assertSiteAcceptsNewWork(site.status);

  const created = await createWithRetry(actor, siteId, weighbridge.id);
  return toPublicTransaction(created);
}

export async function createArrival(
  actor: ActorContext,
  input: CreateTransactionInput & IdentifyTransactionInput,
): Promise<PublicTransaction> {
  const created = await createTransaction(actor, input);
  return identifyTransaction(actor, created.id, { vehicleId: input.vehicleId });
}

export async function identifyTransaction(
  actor: ActorContext,
  transactionId: string,
  input: IdentifyTransactionInput,
): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    const locked = assertTransactionMutable(transaction.status);
    if (locked) {
      throw new HttpError(409, locked);
    }
    if (!canTransition(transaction.status, TransactionStatus.IDENTIFIED)) {
      throw new HttpError(409, "This transaction is not awaiting vehicle identification");
    }

    const vehicle = await tx.vehicle.findFirst({
      where: {
        id: input.vehicleId,
        organizationId: actor.user.organizationId,
        deletedAt: null,
      },
    });

    if (!vehicle) {
      throw new HttpError(400, "Vehicle was not found or is inactive");
    }

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        vehicleId: vehicle.id,
        status: TransactionStatus.IDENTIFIED,
      },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.VEHICLE_IDENTIFIED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          registrationNumber: vehicle.registrationNumber,
        },
      },
      tx,
    );

    return next;
  });

  return toPublicTransaction(updated);
}

export async function recordFirstWeighment(
  actor: ActorContext,
  transactionId: string,
  input: RecordWeighmentInput,
): Promise<PublicTransaction> {
  const parsed = parseWeightKg(input.weightKg);
  if (typeof parsed === "string") {
    throw new HttpError(400, parsed);
  }

  const limitError = assertWeightWithinLimits(parsed, {
    minKg: env.weighmentMinKg,
    maxKg: env.weighmentMaxKg,
  });
  if (limitError) {
    throw new HttpError(400, limitError);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    const locked = assertTransactionMutable(transaction.status);
    if (locked) {
      throw new HttpError(409, locked);
    }
    const weighmentBlocked = assertCanRecordFirstWeighment(transactionProgress(transaction));
    if (weighmentBlocked) {
      throw new HttpError(409, weighmentBlocked);
    }
    if (!canTransition(transaction.status, TransactionStatus.FIRST_WEIGHMENT)) {
      throw new HttpError(409, "First weighment can only be recorded after the vehicle is identified or the document is verified");
    }

    const alreadyGross = transaction.weighments.some((weighment) => weighment.kind === WeighmentKind.GROSS);
    if (alreadyGross) {
      throw new HttpError(409, "A first weighment has already been recorded");
    }

    const weighbridgeId = input.weighbridgeId ?? transaction.weighbridgeId;
    if (!weighbridgeId) {
      throw new HttpError(400, "A weighbridge is required");
    }

    if (transaction.weighbridgeId && weighbridgeId !== transaction.weighbridgeId) {
      throw new HttpError(400, "Weight must be recorded on the assigned weighbridge");
    }

    const sequence = transaction.weighments.length + 1;

    await tx.weighment.create({
      data: {
        transactionId: transaction.id,
        weighbridgeId,
        sequence,
        kind: WeighmentKind.GROSS,
        weightKg: parsed.asDecimal,
        recordedAt: new Date(),
        recordedByUserId: actor.user.id,
        source: input.source,
      },
    });

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        weighbridgeId,
        status: TransactionStatus.FIRST_WEIGHMENT,
      },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.FIRST_WEIGHMENT_RECORDED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          weightKg: parsed.asDecimal,
          source: input.source,
        },
      },
      tx,
    );

    if (next.workflowSnapshot) {
      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.WORKFLOW_STEP_COMPLETED,
          entityType: "Transaction",
          entityId: next.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            referenceNumber: next.referenceNumber,
            capability: "FIRST_WEIGHMENT",
          },
        },
        tx,
      );
    }

    await ensureRequiredApproval(tx, actor, next);

    const synced = await tx.transaction.findFirst({
      where: { id: next.id },
      include: transactionInclude,
    });
    if (!synced) {
      throw new HttpError(404, "Transaction not found");
    }

    return synced;
  });

  await emitPendingApprovalRequired(actor, updated.id);
  return toPublicTransaction(updated);
}

export async function getTransactionTimeline(
  actor: ActorContext,
  id: string,
): Promise<{ items: Array<{ label: string; at: string; status: string; source: "entity" | "audit" }> }> {
  const transaction = await prisma.transaction.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });

  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }

  assertSiteAccess(actor.user, transaction.siteId);
  const publicTransaction = toPublicTransaction(transaction);
  const audits = await prisma.auditLog.findMany({
    where: {
      organizationId: actor.user.organizationId,
      OR: [
        { entityType: "Transaction", entityId: transaction.id },
        {
          entityType: "Approval",
          entityId: { in: transaction.approvals.map((approval) => approval.id) },
        },
      ],
    },
    orderBy: { occurredAt: "asc" },
    take: 200,
  });

  return {
    items: mergeTimeline(
      publicTransaction.timeline,
      audits.map((audit) => ({
        action: audit.action,
        at: audit.occurredAt.toISOString(),
        metadata:
          audit.metadata && typeof audit.metadata === "object" && !Array.isArray(audit.metadata)
            ? (audit.metadata as Record<string, unknown>)
            : null,
      })),
    ),
  };
}

async function createWithRetry(
  actor: ActorContext,
  siteId: string,
  weighbridgeId: string,
): Promise<Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const referenceNumber = await nextReferenceNumber(tx, actor.user.organizationId);
        const site = await tx.site.findFirstOrThrow({
          where: { id: siteId, organizationId: actor.user.organizationId },
          select: { operationMode: true },
        });
        const created = await tx.transaction.create({
          data: {
            organizationId: actor.user.organizationId,
            siteId,
            weighbridgeId,
            referenceNumber,
            status: TransactionStatus.ARRIVED,
            arrivedAt: new Date(),
            operationMode: site.operationMode,
            createdByUserId: actor.user.id,
          },
          include: transactionInclude,
        });

        await writeAudit(
          {
            organizationId: actor.user.organizationId,
            actorUserId: actor.user.id,
            action: AUDIT_ACTIONS.TRANSACTION_CREATED,
            entityType: "Transaction",
            entityId: created.id,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            metadata: { referenceNumber: created.referenceNumber },
          },
          tx,
        );

        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new HttpError(500, "Unable to create a transaction reference");
}

async function nextReferenceNumber(tx: DbClient, organizationId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const latest = await tx.transaction.findFirst({
    where: {
      organizationId,
      referenceNumber: { startsWith: referencePrefix(year) },
    },
    orderBy: { referenceNumber: "desc" },
    select: { referenceNumber: true },
  });

  const current = latest ? parseReferenceSequence(latest.referenceNumber, year) : 0;
  return formatReferenceNumber(year, (current ?? 0) + 1);
}

export async function loadTransaction(tx: DbClient, actor: ActorContext, id: string) {
  const transaction = await tx.transaction.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });

  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }

  assertSiteAccess(actor.user, transaction.siteId);
  return transaction;
}
