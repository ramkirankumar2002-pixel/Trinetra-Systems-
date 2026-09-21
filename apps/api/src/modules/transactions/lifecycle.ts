import {
  Prisma,
  TransactionStatus,
  UnloadingPointStatus,
  UnloadingStatus,
  WeighmentKind,
} from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { calculateNetWeight } from "../../domain/netWeight.js";
import { assertTransactionMutable } from "../../domain/transactionMutability.js";
import { canTransition } from "../../domain/transactionState.js";
import { selectUnloadingPoint } from "../../domain/unloadingAssignment.js";
import { assertWeightWithinLimits, parseWeightKg } from "../../domain/weight.js";
import {
  assertCanAssignUnloading,
  assertCanCompleteUnloading,
  assertCanFinalize,
  assertCanRecordSecondWeighment,
  assertCanStartUnloading,
} from "../../domain/workflowEngine.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import {
  emitTransactionCompleted,
  emitUnloadingEvent,
  emitWeightOrTransactionException,
} from "../notifications/hooks.js";
import type { ActorContext } from "../shared/actor.js";
import { getAccessibleWeighbridge } from "../weighbridges/service.js";
import { toPublicTransaction, transactionInclude, transactionProgress, type PublicTransaction } from "./mapper.js";
import { loadTransaction, recordFirstWeighment } from "./service.js";
import type {
  AssignUnloadingInput,
  CompleteUnloadingInput,
  CorrectionInput,
  RecordWeighmentInput,
} from "./validators.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function recordWeighment(
  actor: ActorContext,
  transactionId: string,
  input: RecordWeighmentInput,
): Promise<PublicTransaction> {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    select: { status: true },
  });
  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }

  const kind = input.kind ?? (transaction.status === TransactionStatus.UNLOADED ? WeighmentKind.TARE : WeighmentKind.GROSS);
  if (kind === WeighmentKind.TARE) {
    return recordSecondWeighment(actor, transactionId, input);
  }
  return recordFirstWeighment(actor, transactionId, input);
}

export async function listWeighments(
  actor: ActorContext,
  transactionId: string,
): Promise<{
  weighments: PublicTransaction["weighments"];
  grossWeightKg: string | null;
  tareWeightKg: string | null;
  netWeightKg: string | null;
}> {
  const transaction = await getPublicTransaction(actor, transactionId);
  return {
    weighments: transaction.weighments,
    grossWeightKg: transaction.grossWeightKg,
    tareWeightKg: transaction.tareWeightKg,
    netWeightKg: transaction.netWeightKg,
  };
}

export async function assignUnloading(
  actor: ActorContext,
  transactionId: string,
  input: AssignUnloadingInput,
): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    assertMutable(transaction.status);
    const blocked = assertCanAssignUnloading(transactionProgress(transaction));
    if (blocked) {
      throw new HttpError(409, blocked);
    }

    const point = input.unloadingPointId
      ? await loadAssignablePoint(
          tx,
          actor,
          transaction.siteId,
          input.unloadingPointId,
          transaction.materialId,
          transaction.id,
        )
      : await resolveConfiguredPoint(tx, actor, transaction.siteId, transaction.materialId);

    const previousPointId = transaction.unloading?.unloadingPoint?.id ?? null;
    if (previousPointId && previousPointId !== point.id) {
      await releasePointIfIdle(tx, previousPointId, transaction.id);
    }

    await occupyPoint(tx, point.id, transaction.id);

    await tx.unloading.upsert({
      where: { transactionId: transaction.id },
      create: {
        transactionId: transaction.id,
        unloadingPointId: point.id,
        instructedByUserId: actor.user.id,
        assignedAt: new Date(),
        locationNote: `${point.code} ${point.name}`,
        status: UnloadingStatus.NOT_STARTED,
      },
      update: {
        unloadingPointId: point.id,
        instructedByUserId: actor.user.id,
        assignedAt: new Date(),
        locationNote: `${point.code} ${point.name}`,
        status: UnloadingStatus.NOT_STARTED,
      },
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.UNLOADING_POINT_ASSIGNED,
        entityType: "Transaction",
        entityId: transaction.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: transaction.referenceNumber,
          pointId: point.id,
          pointCode: point.code,
          pointName: point.name,
        },
      },
      tx,
    );

    return loadFresh(tx, transaction.id);
  });

  await emitUnloadingEvent(actor, updated.id, "ASSIGNED");
  return toPublicTransaction(updated);
}

export async function startUnloading(actor: ActorContext, transactionId: string): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    assertMutable(transaction.status);
    const blocked = assertCanStartUnloading(transactionProgress(transaction));
    if (blocked) {
      throw new HttpError(409, blocked);
    }
    if (!canTransition(transaction.status, TransactionStatus.UNLOADING)) {
      throw new HttpError(409, "This transaction is not ready to start unloading");
    }

    const pointId = transaction.unloading?.unloadingPoint?.id;
    if (!pointId) {
      throw new HttpError(409, "An unloading point must be assigned first");
    }

    await occupyPoint(tx, pointId, transaction.id);

    await tx.unloading.update({
      where: { transactionId: transaction.id },
      data: {
        status: UnloadingStatus.IN_PROGRESS,
        startedAt: new Date(),
        startedByUserId: actor.user.id,
      },
    });

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.UNLOADING },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.UNLOADING_STARTED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          pointId,
          pointCode: transaction.unloading?.unloadingPoint?.code,
        },
      },
      tx,
    );

    return loadFresh(tx, next.id);
  });

  await emitUnloadingEvent(actor, updated.id, "STARTED");
  return toPublicTransaction(updated);
}

export async function completeUnloading(
  actor: ActorContext,
  transactionId: string,
  input: CompleteUnloadingInput,
): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    assertMutable(transaction.status);
    const blocked = assertCanCompleteUnloading(transactionProgress(transaction));
    if (blocked) {
      throw new HttpError(409, blocked);
    }
    if (!canTransition(transaction.status, TransactionStatus.UNLOADED)) {
      throw new HttpError(409, "Unloading can only be completed while it is in progress");
    }

    const pointId = transaction.unloading?.unloadingPoint?.id ?? null;

    await tx.unloading.update({
      where: { transactionId: transaction.id },
      data: {
        status: UnloadingStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId: actor.user.id,
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      },
    });

    if (pointId) {
      await releasePointIfIdle(tx, pointId, transaction.id);
    }

    const claimed = await tx.transaction.updateMany({
      where: { id: transaction.id, status: TransactionStatus.UNLOADING },
      data: { status: TransactionStatus.UNLOADED },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "This transaction was updated by another user");
    }
    const next = await tx.transaction.findFirst({
      where: { id: transaction.id },
      include: transactionInclude,
    });
    if (!next) {
      throw new HttpError(404, "Transaction not found");
    }

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.UNLOADING_COMPLETED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          pointId,
          pointCode: transaction.unloading?.unloadingPoint?.code,
          notes: input.notes ?? null,
        },
      },
      tx,
    );

    return loadFresh(tx, next.id);
  });

  await emitUnloadingEvent(actor, updated.id, "COMPLETED");
  return toPublicTransaction(updated);
}

export async function recordSecondWeighment(
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
    assertMutable(transaction.status);
    const blocked = assertCanRecordSecondWeighment(transactionProgress(transaction));
    if (blocked) {
      throw new HttpError(409, blocked);
    }

    const alreadyTare = transaction.weighments.some((weighment) => weighment.kind === WeighmentKind.TARE);
    if (alreadyTare) {
      throw new HttpError(409, "A second weighment has already been recorded");
    }

    const gross = transaction.weighments.find((weighment) => weighment.kind === WeighmentKind.GROSS);
    if (!gross) {
      throw new HttpError(409, "A first weighment is required before the second weighment");
    }

    const weighbridgeId = input.weighbridgeId ?? transaction.weighbridgeId;
    if (!weighbridgeId) {
      throw new HttpError(400, "A weighbridge is required");
    }
    if (transaction.weighbridgeId && weighbridgeId !== transaction.weighbridgeId) {
      throw new HttpError(400, "Weight must be recorded on the assigned weighbridge");
    }

    const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
    if (!weighbridge.isActive) {
      throw new HttpError(400, "This weighbridge is offline");
    }

    const sequence = transaction.weighments.length + 1;
    await tx.weighment.create({
      data: {
        transactionId: transaction.id,
        weighbridgeId,
        sequence,
        kind: WeighmentKind.TARE,
        weightKg: parsed.asDecimal,
        recordedAt: new Date(),
        recordedByUserId: actor.user.id,
        source: input.source,
      },
    });

    const net = calculateNetWeight(gross.weightKg.toString(), parsed.asDecimal);
    const nextStatus = net.tareExceedsGross ? TransactionStatus.EXCEPTION : TransactionStatus.SECOND_WEIGHMENT;
    if (!canTransition(transaction.status, nextStatus)) {
      throw new HttpError(409, "This transaction is not ready for second weighment");
    }

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        weighbridgeId,
        status: nextStatus,
        netWeightKg: net.netAsDecimal,
        ...(net.tareExceedsGross
          ? {
              exceptionReason:
                "Tare weight exceeds gross weight. This is an operational exception for review, not a fraud finding.",
            }
          : {}),
      },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SECOND_WEIGHMENT_RECORDED,
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

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.NET_WEIGHT_CALCULATED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          grossWeightKg: gross.weightKg.toString(),
          tareWeightKg: parsed.asDecimal,
          netWeightKg: net.netAsDecimal,
          tareExceedsGross: net.tareExceedsGross,
        },
      },
      tx,
    );

    if (net.tareExceedsGross) {
      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.TRANSACTION_EXCEPTION,
          entityType: "Transaction",
          entityId: next.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            referenceNumber: next.referenceNumber,
            reason: "TARE_EXCEEDS_GROSS",
            grossWeightKg: gross.weightKg.toString(),
            tareWeightKg: parsed.asDecimal,
          },
        },
        tx,
      );
    }

    return loadFresh(tx, next.id);
  });

  if (updated.status === TransactionStatus.EXCEPTION) {
    await emitWeightOrTransactionException(actor, updated.id, "WEIGHT");
  }
  return toPublicTransaction(updated);
}

export async function finalizeTransaction(actor: ActorContext, transactionId: string): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadTransaction(tx, actor, transactionId);
    assertMutable(transaction.status);
    const progress = transactionProgress(transaction);
    const blocked = assertCanFinalize(progress);
    if (blocked) {
      throw new HttpError(409, blocked);
    }
    if (!canTransition(transaction.status, TransactionStatus.COMPLETED)) {
      throw new HttpError(409, "This transaction is not ready for completion");
    }

    const gross = transaction.weighments.find((weighment) => weighment.kind === WeighmentKind.GROSS);
    const tare = transaction.weighments.find((weighment) => weighment.kind === WeighmentKind.TARE);
    if (!gross || !tare) {
      throw new HttpError(409, "Both weighments are required before completion");
    }

    const net = calculateNetWeight(gross.weightKg.toString(), tare.weightKg.toString());
    if (net.tareExceedsGross) {
      throw new HttpError(409, "This transaction has a weight exception and needs review before completion");
    }

    const claimed = await tx.transaction.updateMany({
      where: { id: transaction.id, status: TransactionStatus.SECOND_WEIGHMENT },
      data: {
        status: TransactionStatus.COMPLETED,
        completedAt: new Date(),
        completedByUserId: actor.user.id,
        netWeightKg: net.netAsDecimal,
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "This transaction was updated by another user");
    }
    const next = await tx.transaction.findFirst({
      where: { id: transaction.id },
      include: transactionInclude,
    });
    if (!next) {
      throw new HttpError(404, "Transaction not found");
    }

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.TRANSACTION_COMPLETED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          grossWeightKg: gross.weightKg.toString(),
          tareWeightKg: tare.weightKg.toString(),
          netWeightKg: net.netAsDecimal,
          unloadingPointCode: transaction.unloading?.unloadingPoint?.code ?? null,
        },
      },
      tx,
    );

    return loadFresh(tx, next.id);
  });

  await emitTransactionCompleted(actor, updated.id);
  return toPublicTransaction(updated);
}

/**
 * Records a correction request only. Historical weighment and completion values
 * are not changed in this step. A later approval/apply workflow will use these rows.
 */
export async function requestTransactionCorrection(
  actor: ActorContext,
  transactionId: string,
  input: CorrectionInput,
): Promise<{
  correction: {
    id: string;
    field: string;
    originalValue: string;
    proposedValue: string;
    reason: string;
    status: string;
    requestedAt: string;
  };
}> {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    select: { id: true, referenceNumber: true, siteId: true, status: true },
  });
  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }

  assertSiteAccess(actor.user, transaction.siteId);

  const created = await prisma.transactionCorrection.create({
    data: {
      organizationId: actor.user.organizationId,
      transactionId: transaction.id,
      field: input.field,
      originalValue: input.originalValue,
      proposedValue: input.proposedValue,
      reason: input.reason,
      requestedByUserId: actor.user.id,
    },
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.TRANSACTION_CORRECTION_REQUESTED,
    entityType: "Transaction",
    entityId: transaction.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      referenceNumber: transaction.referenceNumber,
      correctionId: created.id,
      field: input.field,
      originalValue: input.originalValue,
      proposedValue: input.proposedValue,
    },
  });

  return {
    correction: {
      id: created.id,
      field: created.field,
      originalValue: created.originalValue,
      proposedValue: created.proposedValue,
      reason: created.reason,
      status: created.status,
      requestedAt: created.requestedAt.toISOString(),
    },
  };
}

async function getPublicTransaction(actor: ActorContext, transactionId: string): Promise<PublicTransaction> {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });
  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }
  assertSiteAccess(actor.user, transaction.siteId);
  return toPublicTransaction(transaction);
}

function assertMutable(status: TransactionStatus): void {
  const blocked = assertTransactionMutable(status);
  if (blocked) {
    throw new HttpError(409, blocked);
  }
}

async function resolveConfiguredPoint(
  tx: DbClient,
  actor: ActorContext,
  siteId: string,
  materialId: string | null,
) {
  const [points, rules] = await Promise.all([
    tx.unloadingPoint.findMany({
      where: { organizationId: actor.user.organizationId, siteId, deletedAt: null },
    }),
    tx.unloadingPointAssignmentRule.findMany({
      where: { organizationId: actor.user.organizationId, siteId, isActive: true },
    }),
  ]);

  const selected = selectUnloadingPoint({
    siteId,
    materialId,
    points: points.map((point) => ({
      id: point.id,
      siteId: point.siteId,
      code: point.code,
      name: point.name,
      status: point.status,
      isActive: point.isActive,
      allowedMaterialIds: point.allowedMaterialIds,
      sortOrder: point.sortOrder,
    })),
    rules: rules.map((rule) => ({
      id: rule.id,
      siteId: rule.siteId,
      materialId: rule.materialId,
      unloadingPointId: rule.unloadingPointId,
      priority: rule.priority,
      isActive: rule.isActive,
    })),
  });

  if (!selected) {
    throw new HttpError(409, "No available unloading point matches the configured assignment rules");
  }

  return selected;
}

async function loadAssignablePoint(
  tx: DbClient,
  actor: ActorContext,
  siteId: string,
  unloadingPointId: string,
  materialId: string | null,
  transactionId: string,
) {
  const point = await tx.unloadingPoint.findFirst({
    where: {
      id: unloadingPointId,
      organizationId: actor.user.organizationId,
      deletedAt: null,
    },
  });
  if (!point) {
    throw new HttpError(404, "Unloading point not found");
  }
  if (point.siteId !== siteId) {
    throw new HttpError(400, "Unloading point does not belong to this site");
  }
  if (!point.isActive || point.status === UnloadingPointStatus.INACTIVE) {
    throw new HttpError(409, "This unloading point is inactive");
  }
  if (point.allowedMaterialIds.length > 0 && (materialId === null || !point.allowedMaterialIds.includes(materialId))) {
    throw new HttpError(409, "This unloading point does not accept the assigned material");
  }
  if (point.status === UnloadingPointStatus.OCCUPIED) {
    const occupant = await tx.unloading.findFirst({
      where: {
        unloadingPointId: point.id,
        transactionId: { not: transactionId },
        status: { in: [UnloadingStatus.NOT_STARTED, UnloadingStatus.IN_PROGRESS] },
      },
    });
    if (occupant) {
      throw new HttpError(409, "This unloading point is occupied");
    }
  }
  return point;
}

async function occupyPoint(tx: DbClient, pointId: string, transactionId: string): Promise<void> {
  const occupant = await tx.unloading.findFirst({
    where: {
      unloadingPointId: pointId,
      transactionId: { not: transactionId },
      status: { in: [UnloadingStatus.NOT_STARTED, UnloadingStatus.IN_PROGRESS] },
    },
  });
  if (occupant) {
    throw new HttpError(409, "This unloading point is occupied");
  }

  await tx.unloadingPoint.update({
    where: { id: pointId },
    data: { status: UnloadingPointStatus.OCCUPIED },
  });
}

async function releasePointIfIdle(tx: DbClient, pointId: string, transactionId: string): Promise<void> {
  const other = await tx.unloading.findFirst({
    where: {
      unloadingPointId: pointId,
      transactionId: { not: transactionId },
      status: { in: [UnloadingStatus.NOT_STARTED, UnloadingStatus.IN_PROGRESS] },
    },
  });
  if (other) {
    return;
  }

  await tx.unloadingPoint.updateMany({
    where: { id: pointId, status: UnloadingPointStatus.OCCUPIED },
    data: { status: UnloadingPointStatus.AVAILABLE },
  });
}

async function loadFresh(tx: DbClient, id: string) {
  const record = await tx.transaction.findFirst({
    where: { id },
    include: transactionInclude,
  });
  if (!record) {
    throw new HttpError(404, "Transaction not found");
  }
  return record;
}
