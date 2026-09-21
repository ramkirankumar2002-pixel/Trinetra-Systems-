import { ApprovalDecision, Prisma, TransactionStatus, WorkflowCapability } from "@prisma/client";
import { DEPARTMENT_REQUESTED_ROLES } from "../../domain/approvalEligibility.js";
import { hasActiveApprovalForStep } from "../../domain/approvalState.js";
import { remainingApprovalSteps } from "../../domain/workflowEngine.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { emitPendingApprovalRequired } from "../notifications/hooks.js";
import type { ActorContext } from "../shared/actor.js";
import { transactionInclude, transactionProgress, type TransactionRecord } from "../transactions/mapper.js";
import { canTransition } from "../../domain/transactionState.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function ensureRequiredApproval(
  db: DbClient,
  actor: ActorContext,
  transaction: TransactionRecord,
): Promise<{ approvalId: string | null; created: boolean }> {
  const progress = transactionProgress(transaction);
  if (progress.rejectedStepSortOrders.length > 0 || transaction.status === TransactionStatus.REJECTED) {
    return { approvalId: null, created: false };
  }

  const remaining = remainingApprovalSteps(progress.snapshot, progress);
  const nextStep = remaining[0];
  if (!nextStep || !nextStep.approvalDepartment) {
    return { approvalId: progress.pendingApproval?.id ?? null, created: false };
  }

  if (hasActiveApprovalForStep(transaction.approvals, nextStep.sortOrder)) {
    const existing = transaction.approvals.find(
      (approval) =>
        approval.snapshotStepSortOrder === nextStep.sortOrder && approval.decision === ApprovalDecision.PENDING,
    );
    return { approvalId: existing?.id ?? progress.pendingApproval?.id ?? null, created: false };
  }

  if (
    transaction.status === TransactionStatus.FIRST_WEIGHMENT &&
    canTransition(transaction.status, TransactionStatus.PENDING_APPROVAL)
  ) {
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.PENDING_APPROVAL },
    });
  }

  const requestedRoleCode = DEPARTMENT_REQUESTED_ROLES[nextStep.approvalDepartment.code] ?? null;
  const workflowDefinitionId = progress.snapshot?.workflow.id;
  const liveStep = workflowDefinitionId
    ? await db.workflowStep.findFirst({
        where: {
          workflowDefinitionId,
          sortOrder: nextStep.sortOrder,
          capability: WorkflowCapability.APPROVAL,
        },
        select: { id: true },
      })
    : null;

  try {
    const created = await db.approval.create({
      data: {
        organizationId: transaction.organizationId,
        siteId: transaction.siteId,
        transactionId: transaction.id,
        workflowStepId: liveStep?.id ?? null,
        snapshotStepSortOrder: nextStep.sortOrder,
        snapshotCapability: nextStep.capability,
        snapshotStepName: nextStep.name,
        stage: nextStep.sortOrder,
        departmentId: nextStep.approvalDepartment.id,
        requestedRoleCode,
        decision: ApprovalDecision.PENDING,
      },
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.APPROVAL_CREATED,
        entityType: "Approval",
        entityId: created.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          departmentCode: nextStep.approvalDepartment.code,
          departmentName: nextStep.approvalDepartment.name,
          stepName: nextStep.name,
          snapshotStepSortOrder: nextStep.sortOrder,
        },
      },
      db,
    );

    return { approvalId: created.id, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await db.approval.findFirst({
        where: {
          transactionId: transaction.id,
          snapshotStepSortOrder: nextStep.sortOrder,
          decision: ApprovalDecision.PENDING,
        },
        select: { id: true },
      });
      return { approvalId: existing?.id ?? null, created: false };
    }
    throw error;
  }
}

export async function syncOpenTransactionApprovals(
  actor: ActorContext,
  siteWhere: Prisma.TransactionWhereInput,
): Promise<void> {
  const stale = await prisma.transaction.findMany({
    where: {
      organizationId: actor.user.organizationId,
      status: { in: [TransactionStatus.FIRST_WEIGHMENT, TransactionStatus.PENDING_APPROVAL] },
      ...siteWhere,
      approvals: { none: { decision: ApprovalDecision.PENDING } },
    },
    include: transactionInclude,
    take: 25,
  });

  for (const transaction of stale) {
    await prisma.$transaction(async (tx) => {
      await ensureRequiredApproval(tx, actor, transaction);
    });
    await emitPendingApprovalRequired(actor, transaction.id);
  }
}

export function assertApprovalWorkflowReady(transaction: TransactionRecord): void {
  const progress = transactionProgress(transaction);
  if (!progress.hasGross) {
    throw new HttpError(409, "Approval cannot be decided before the first weighment");
  }
  if (progress.rejectedStepSortOrders.length > 0 || transaction.status === TransactionStatus.REJECTED) {
    throw new HttpError(409, "This transaction is already blocked by a rejected approval");
  }
}
