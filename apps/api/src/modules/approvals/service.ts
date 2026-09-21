import { ApprovalDecision, Prisma, TransactionStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import {
  approvalEligibilityFromUser,
  canDecideApproval,
} from "../../domain/approvalEligibility.js";
import { applyApprovalDecision } from "../../domain/approvalState.js";
import { parsePagination } from "../../domain/pagination.js";
import { remainingApprovalSteps } from "../../domain/workflowEngine.js";
import { canTransition } from "../../domain/transactionState.js";
import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { transactionInclude, transactionProgress } from "../transactions/mapper.js";
import { accessibleSiteWhere } from "../shared/siteScope.js";
import { emitApprovalDecision, emitPendingApprovalRequired } from "../notifications/hooks.js";
import { assertApprovalWorkflowReady, ensureRequiredApproval, syncOpenTransactionApprovals } from "./engine.js";
import { approvalListInclude, toPublicApproval, type PublicApproval } from "./mapper.js";
import { parseApprovalStatusFilter, parseOptionalDate } from "./validators.js";

export async function listApprovals(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicApproval[]; page: number; pageSize: number; total: number; pendingCount: number }> {
  const pagination = parsePagination(query);
  const decision = parseApprovalStatusFilter(query.status);
  const from = parseOptionalDate(query.from, "from");
  const to = parseOptionalDate(query.to, "to");
  const q = typeof query.q === "string" ? query.q.trim() : "";
  const departmentId = typeof query.departmentId === "string" && query.departmentId !== "" ? query.departmentId : undefined;
  const materialId = typeof query.materialId === "string" && query.materialId !== "" ? query.materialId : undefined;
  const siteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;

  if (siteId) {
    assertSiteAccess(actor.user, siteId);
  }

  await syncOpenTransactionApprovals(actor, accessibleSiteWhere(actor));

  const where: Prisma.ApprovalWhereInput = {
    organizationId: actor.user.organizationId,
    ...accessibleApprovalSiteWhere(actor),
  };

  if (decision) {
    where.decision = decision;
  }
  if (departmentId) {
    where.departmentId = departmentId;
  }
  if (siteId) {
    where.siteId = siteId;
  }
  if (from || to) {
    where.requestedAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (materialId) {
    where.transaction = { ...(where.transaction as Prisma.TransactionWhereInput | undefined), materialId };
  }
  if (q !== "") {
    const registration = normalizeRegistrationNumber(q);
    where.OR = [
      { transaction: { referenceNumber: { contains: q.toUpperCase() } } },
      ...(registration === ""
        ? []
        : [{ transaction: { vehicle: { registrationNumber: { contains: registration } } } }]),
    ];
  }

  const visibleWhere = restrictToEligibleApprovals(actor, where);

  const [total, pendingCount, rows] = await prisma.$transaction([
    prisma.approval.count({ where: visibleWhere }),
    prisma.approval.count({
      where: restrictToEligibleApprovals(actor, {
        organizationId: actor.user.organizationId,
        decision: ApprovalDecision.PENDING,
        ...accessibleApprovalSiteWhere(actor),
      }),
    }),
    prisma.approval.findMany({
      where: visibleWhere,
      include: approvalListInclude,
      orderBy: { requestedAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) => toPublicApproval(row, canActorDecide(actor, row))),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    pendingCount,
  };
}

export async function getApproval(actor: ActorContext, id: string): Promise<PublicApproval> {
  const record = await prisma.approval.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: approvalListInclude,
  });

  if (!record) {
    throw new HttpError(404, "Approval not found");
  }

  assertSiteAccess(actor.user, record.siteId);
  if (!canActorSee(actor, record)) {
    throw new HttpError(403, "You are not authorized to view this approval");
  }

  return toPublicApproval(record, canActorDecide(actor, record));
}

export async function approveRequest(
  actor: ActorContext,
  id: string,
  input: { comments: string | null },
): Promise<PublicApproval> {
  const updatedId = await prisma.$transaction(async (tx) => {
    const current = await tx.approval.findFirst({
      where: { id, organizationId: actor.user.organizationId },
      include: approvalListInclude,
    });
    if (!current) {
      throw new HttpError(404, "Approval not found");
    }

    assertSiteAccess(actor.user, current.siteId);
    if (!canActorDecide(actor, current)) {
      throw new HttpError(403, "You are not authorized to approve this request");
    }

    const decisionCheck = applyApprovalDecision(current.decision, ApprovalDecision.APPROVED);
    if (!decisionCheck.ok) {
      throw new HttpError(409, decisionCheck.error);
    }

    const transaction = await tx.transaction.findFirst({
      where: { id: current.transactionId },
      include: transactionInclude,
    });
    if (!transaction) {
      throw new HttpError(404, "Transaction not found");
    }
    assertApprovalWorkflowReady(transaction);

    const claimed = await tx.approval.updateMany({
      where: { id: current.id, decision: ApprovalDecision.PENDING },
      data: {
        decision: ApprovalDecision.APPROVED,
        approverUserId: actor.user.id,
        comments: input.comments,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "Approval is no longer pending.");
    }

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.APPROVAL_APPROVED,
        entityType: "Approval",
        entityId: current.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          departmentName: current.department.name,
          departmentCode: current.department.code,
          stepName: current.snapshotStepName,
          comments: input.comments,
        },
      },
      tx,
    );

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.WORKFLOW_STEP_COMPLETED,
        entityType: "Transaction",
        entityId: transaction.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: transaction.referenceNumber,
          capability: current.snapshotCapability,
          approvalId: current.id,
          stepName: current.snapshotStepName,
        },
      },
      tx,
    );

    const refreshed = await tx.transaction.findFirst({
      where: { id: transaction.id },
      include: transactionInclude,
    });
    if (!refreshed) {
      throw new HttpError(404, "Transaction not found");
    }

    const progress = transactionProgress(refreshed);
    const remaining = remainingApprovalSteps(progress.snapshot, progress);
    if (remaining.length === 0) {
      if (canTransition(refreshed.status, TransactionStatus.APPROVED)) {
        await tx.transaction.update({
          where: { id: refreshed.id },
          data: { status: TransactionStatus.APPROVED },
        });
      }
    } else {
      await ensureRequiredApproval(tx, actor, refreshed);
    }

    return current.id;
  });

  await emitApprovalDecision(actor, updatedId, "APPROVED");
  const approval = await getApproval(actor, updatedId);
  await emitPendingApprovalRequired(actor, approval.transaction.id);
  return approval;
}

export async function rejectRequest(
  actor: ActorContext,
  id: string,
  input: { reason: string },
): Promise<PublicApproval> {
  const updatedId = await prisma.$transaction(async (tx) => {
    const current = await tx.approval.findFirst({
      where: { id, organizationId: actor.user.organizationId },
      include: approvalListInclude,
    });
    if (!current) {
      throw new HttpError(404, "Approval not found");
    }

    assertSiteAccess(actor.user, current.siteId);
    if (!canActorDecide(actor, current)) {
      throw new HttpError(403, "You are not authorized to reject this request");
    }

    const decisionCheck = applyApprovalDecision(current.decision, ApprovalDecision.REJECTED);
    if (!decisionCheck.ok) {
      throw new HttpError(409, decisionCheck.error);
    }

    const transaction = await tx.transaction.findFirst({
      where: { id: current.transactionId },
      include: transactionInclude,
    });
    if (!transaction) {
      throw new HttpError(404, "Transaction not found");
    }
    assertApprovalWorkflowReady(transaction);

    const claimed = await tx.approval.updateMany({
      where: { id: current.id, decision: ApprovalDecision.PENDING },
      data: {
        decision: ApprovalDecision.REJECTED,
        approverUserId: actor.user.id,
        comments: input.reason,
        decidedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "Approval is no longer pending.");
    }

    if (canTransition(transaction.status, TransactionStatus.REJECTED)) {
      await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status: TransactionStatus.REJECTED,
          exceptionReason: input.reason,
        },
      });
    }

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.APPROVAL_REJECTED,
        entityType: "Approval",
        entityId: current.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          departmentName: current.department.name,
          departmentCode: current.department.code,
          stepName: current.snapshotStepName,
          reason: input.reason,
        },
      },
      tx,
    );

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.WORKFLOW_STEP_REJECTED,
        entityType: "Transaction",
        entityId: transaction.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: transaction.referenceNumber,
          capability: current.snapshotCapability,
          approvalId: current.id,
          reason: input.reason,
        },
      },
      tx,
    );

    return current.id;
  });

  await emitApprovalDecision(actor, updatedId, "REJECTED");
  return getApproval(actor, updatedId);
}

function canActorDecide(
  actor: ActorContext,
  record: {
    departmentId: string;
    assignedUserId: string | null;
    department: { code: string };
  },
): boolean {
  return canDecideApproval({
    ...approvalEligibilityFromUser(actor.user),
    approvalDepartmentId: record.departmentId,
    approvalDepartmentCode: record.department.code,
    assignedUserId: record.assignedUserId,
  });
}

function canActorSee(
  actor: ActorContext,
  record: {
    departmentId: string;
    assignedUserId: string | null;
    department: { code: string };
  },
): boolean {
  if (actor.user.roles.some((role) => role.code === "ADMIN")) {
    return true;
  }
  return canActorDecide(actor, record);
}

function restrictToEligibleApprovals(
  actor: ActorContext,
  where: Prisma.ApprovalWhereInput,
): Prisma.ApprovalWhereInput {
  if (actor.user.roles.some((role) => role.code === "ADMIN")) {
    return where;
  }

  const eligibility = approvalEligibilityFromUser(actor.user);
  const departmentCodes = [
    ...(eligibility.departmentCode ? [eligibility.departmentCode] : []),
    ...eligibility.roleCodes.flatMap((role) => {
      if (role === "STORE_OFFICER") return ["STORE"];
      if (role === "SUPERVISOR") return ["SUPERVISOR"];
      if (role === "LAB_USER") return ["LAB"];
      return [];
    }),
  ];

  return {
    AND: [
      where,
      {
        OR: [
          { assignedUserId: actor.user.id },
          ...(eligibility.departmentId ? [{ departmentId: eligibility.departmentId }] : []),
          ...(departmentCodes.length > 0 ? [{ department: { code: { in: [...new Set(departmentCodes)] } } }] : []),
        ],
      },
    ],
  };
}

function accessibleApprovalSiteWhere(actor: ActorContext): Prisma.ApprovalWhereInput {
  const transactionWhere = accessibleSiteWhere(actor);
  const siteId = transactionWhere.siteId;
  if (typeof siteId === "string") {
    return { siteId };
  }
  if (siteId && typeof siteId === "object" && "in" in siteId && Array.isArray(siteId.in)) {
    return { siteId: { in: siteId.in.filter((value): value is string => typeof value === "string") } };
  }
  return {};
}
