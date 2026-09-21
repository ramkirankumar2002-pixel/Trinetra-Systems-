import { ApprovalDecision, DocumentStatus, Prisma, TransactionStatus, WeighmentKind } from "@prisma/client";
import { calculateNetWeight } from "../../domain/netWeight.js";
import { classifyDashboardException, type DashboardExceptionType } from "../../domain/dashboardScope.js";
import { durationBetween } from "../../domain/reporting/duration.js";
import { resolveNextAction, type WorkflowProgressContext } from "../../domain/workflowEngine.js";
import { parseWorkflowSnapshot } from "../../domain/workflowSnapshot.js";

export const dashboardTransactionInclude = {
  site: { select: { id: true, code: true, name: true } },
  weighbridge: { select: { id: true, code: true, name: true } },
  vehicle: {
    select: {
      id: true,
      registrationNumber: true,
      displayRegistrationNumber: true,
    },
  },
  material: { select: { id: true, code: true, name: true, unitOfMeasure: true } },
  supplier: { select: { id: true, name: true, code: true } },
  workflowDefinition: { select: { id: true, code: true, name: true } },
  createdByUser: { select: { id: true, fullName: true } },
  weighments: {
    select: { kind: true, weightKg: true },
    orderBy: { sequence: "asc" as const },
  },
  documents: { select: { status: true, documentType: true } },
  unloading: {
    select: {
      status: true,
      assignedAt: true,
      unloadingPoint: { select: { id: true, code: true, name: true, status: true } },
    },
  },
  approvals: {
    select: {
      id: true,
      decision: true,
      snapshotStepName: true,
      snapshotStepSortOrder: true,
      requestedAt: true,
      department: { select: { id: true, code: true, name: true } },
    },
    orderBy: { requestedAt: "desc" as const },
  },
} as const;

export type DashboardTransactionRecord = Prisma.TransactionGetPayload<{
  include: typeof dashboardTransactionInclude;
}>;

export type PublicDashboardTransaction = {
  id: string;
  referenceNumber: string;
  status: string;
  workflowCode: string | null;
  workflowName: string | null;
  vehicleNumber: string | null;
  material: { id: string; code: string; name: string } | null;
  supplier: { id: string; name: string; code: string | null } | null;
  site: { id: string; code: string; name: string };
  weighbridge: { id: string; code: string; name: string } | null;
  responsibleStage: string;
  nextActionCode: string;
  grossWeightKg: string | null;
  tareWeightKg: string | null;
  netWeightKg: string | null;
  unloadingPoint: { id: string; code: string; name: string } | null;
  unloadingStatus: string | null;
  assignedAt: string | null;
  approvalStatus: string | null;
  arrivedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  durationLabel: string;
  exceptionReason: string | null;
};

export type PublicDashboardException = PublicDashboardTransaction & {
  exceptionType: DashboardExceptionType;
  message: string;
};

export type PublicDashboardApproval = {
  id: string;
  stepName: string;
  approvalType: string;
  status: string;
  requestedAt: string;
  requestedBy: { id: string; fullName: string } | null;
  department: { id: string; code: string; name: string };
  canOpenApproval: boolean;
  transaction: PublicDashboardTransaction;
};

export type PublicAuditItem = {
  id: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  result: string;
};

export function toDashboardTransaction(record: DashboardTransactionRecord): PublicDashboardTransaction {
  const weights = extractWeights(record);
  const snapshot = parseWorkflowSnapshot(record.workflowSnapshot);
  const progress = dashboardProgress(record, weights);
  const next = resolveNextAction(progress);
  const latestApproval = record.approvals[0];
  const duration = durationBetween(record.createdAt, record.completedAt);

  return {
    id: record.id,
    referenceNumber: record.referenceNumber,
    status: record.status,
    workflowCode: snapshot?.workflow.code ?? record.workflowDefinition?.code ?? null,
    workflowName: snapshot?.workflow.name ?? record.workflowDefinition?.name ?? null,
    vehicleNumber: record.vehicle?.displayRegistrationNumber ?? null,
    material: record.material
      ? { id: record.material.id, code: record.material.code, name: record.material.name }
      : null,
    supplier: record.supplier
      ? { id: record.supplier.id, name: record.supplier.name, code: record.supplier.code }
      : null,
    site: record.site,
    weighbridge: record.weighbridge,
    responsibleStage: next.label,
    nextActionCode: next.code,
    grossWeightKg: weights.gross,
    tareWeightKg: weights.tare,
    netWeightKg: record.netWeightKg?.toString() ?? (weights.tareExceedsGross ? null : weights.net),
    unloadingPoint: record.unloading?.unloadingPoint
      ? {
          id: record.unloading.unloadingPoint.id,
          code: record.unloading.unloadingPoint.code,
          name: record.unloading.unloadingPoint.name,
        }
      : null,
    unloadingStatus: record.unloading?.status ?? null,
    assignedAt: record.unloading?.assignedAt?.toISOString() ?? null,
    approvalStatus: latestApproval?.decision ?? null,
    arrivedAt: record.arrivedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    durationMs: duration.milliseconds,
    durationLabel: duration.label,
    exceptionReason: record.exceptionReason,
  };
}

export function toDashboardException(record: DashboardTransactionRecord): PublicDashboardException {
  const transaction = toDashboardTransaction(record);
  const weights = extractWeights(record);
  const rejected = record.documents.find((document) => document.status === DocumentStatus.REJECTED);
  const classified = classifyDashboardException({
    status: record.status,
    exceptionReason: record.exceptionReason,
    holdReason: record.holdReason,
    hasRejectedDocument: rejected !== undefined,
    rejectedDocumentType: rejected?.documentType ?? null,
    missingRequiredDocument: record.status === TransactionStatus.DOCUMENT_PENDING,
    approvedWithoutUnloadingPoint:
      record.status === TransactionStatus.APPROVED && record.unloading?.unloadingPoint == null,
    tareExceedsGross: weights.tareExceedsGross,
  });

  return {
    ...transaction,
    exceptionType: classified.type,
    message: classified.message,
  };
}

export function toDashboardApproval(
  record: DashboardTransactionRecord,
  approval: DashboardTransactionRecord["approvals"][number],
  canOpenApproval: boolean,
): PublicDashboardApproval {
  return {
    id: approval.id,
    stepName: approval.snapshotStepName,
    approvalType: approval.department.name,
    status: approval.decision,
    requestedAt: approval.requestedAt.toISOString(),
    requestedBy: record.createdByUser,
    department: approval.department,
    canOpenApproval,
    transaction: toDashboardTransaction(record),
  };
}

export function toPublicAuditItem(row: {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  actorUser: { fullName: string } | null;
  metadata: Prisma.JsonValue | null;
}): PublicAuditItem {
  return {
    id: row.id,
    user: row.actorUser?.fullName ?? "System",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    occurredAt: row.occurredAt.toISOString(),
    result: auditResult(row.action, row.metadata),
  };
}

function extractWeights(record: DashboardTransactionRecord): {
  gross: string | null;
  tare: string | null;
  net: string | null;
  tareExceedsGross: boolean;
} {
  const gross = record.weighments.find((weighment) => weighment.kind === WeighmentKind.GROSS);
  const tare = record.weighments.find((weighment) => weighment.kind === WeighmentKind.TARE);
  const computed =
    gross && tare ? calculateNetWeight(gross.weightKg.toString(), tare.weightKg.toString()) : null;

  return {
    gross: gross ? gross.weightKg.toString() : null,
    tare: tare ? tare.weightKg.toString() : null,
    net: record.netWeightKg?.toString() ?? computed?.netAsDecimal ?? null,
    tareExceedsGross: computed?.tareExceedsGross === true,
  };
}

function dashboardProgress(
  record: DashboardTransactionRecord,
  weights: { gross: string | null; tare: string | null; net: string | null; tareExceedsGross: boolean },
): WorkflowProgressContext {
  const snapshot = parseWorkflowSnapshot(record.workflowSnapshot);
  const pending = record.approvals.find((approval) => approval.decision === ApprovalDecision.PENDING);
  return {
    status: record.status,
    hasVehicle: record.vehicle !== null,
    hasGross: weights.gross !== null,
    hasTare: weights.tare !== null,
    hasDocument: record.documents.length > 0,
    hasVerifiedDocument: record.documents.some((document) => document.status === DocumentStatus.VERIFIED),
    snapshot,
    grossWeightKg: weights.gross === null ? null : Number(weights.gross),
    netWeightKg: weights.net,
    tareExceedsGross: weights.tareExceedsGross,
    hasUnloadingPoint: record.unloading?.unloadingPoint != null,
    unloadingStatus: record.unloading?.status ?? null,
    isCompleted: record.status === TransactionStatus.COMPLETED && record.completedAt !== null,
    approvedStepSortOrders: record.approvals
      .filter((approval) => approval.decision === ApprovalDecision.APPROVED)
      .map((approval) => approval.snapshotStepSortOrder),
    rejectedStepSortOrders: record.approvals
      .filter((approval) => approval.decision === ApprovalDecision.REJECTED)
      .map((approval) => approval.snapshotStepSortOrder),
    pendingApproval: pending
      ? {
          id: pending.id,
          sortOrder: pending.snapshotStepSortOrder,
          departmentName: pending.department.name,
        }
      : null,
  };
}

function auditResult(action: string, metadata: Prisma.JsonValue | null): string {
  if (action.endsWith("_REJECTED") || action === "TRANSACTION_EXCEPTION") {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata) && "reason" in metadata) {
      const reason = metadata.reason;
      if (typeof reason === "string" && reason.trim() !== "") {
        return reason;
      }
    }
    return "Needs review";
  }
  if (action.endsWith("_COMPLETED") || action.endsWith("_APPROVED") || action.endsWith("_RECORDED")) {
    return "Completed";
  }
  return "Recorded";
}
