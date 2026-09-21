import { ApprovalDecision, type Prisma } from "@prisma/client";
import { calculateNetWeight } from "../../domain/netWeight.js";
import {
  resolveAllowedActions,
  resolveApprovalRequirement,
  resolveNextAction,
  type NextAction,
  type TransactionAction,
  type WorkflowProgressContext,
} from "../../domain/workflowEngine.js";
import { parseWorkflowSnapshot, type WorkflowSnapshot } from "../../domain/workflowSnapshot.js";

export type MaterialSuggestion = {
  status: string;
  reason: string;
  ocrMaterialName: string | null;
  ocrConfidence: number | null;
  material: { id: string; code: string; name: string } | null;
};

export const transactionInclude = {
  site: { select: { id: true, code: true, name: true } },
  weighbridge: { select: { id: true, code: true, name: true } },
  vehicle: {
    select: {
      id: true,
      registrationNumber: true,
      displayRegistrationNumber: true,
      vehicleType: true,
      transporterName: true,
    },
  },
  material: { select: { id: true, code: true, name: true, unitOfMeasure: true } },
  supplier: { select: { id: true, name: true, code: true } },
  materialVerifiedByUser: { select: { id: true, fullName: true } },
  createdByUser: { select: { id: true, fullName: true } },
  completedByUser: { select: { id: true, fullName: true } },
  unloading: {
    select: {
      status: true,
      notes: true,
      assignedAt: true,
      startedAt: true,
      completedAt: true,
      unloadingPoint: { select: { id: true, code: true, name: true, status: true } },
      instructedByUser: { select: { id: true, fullName: true } },
      startedByUser: { select: { id: true, fullName: true } },
      completedByUser: { select: { id: true, fullName: true } },
    },
  },
  approvals: {
    orderBy: { requestedAt: "asc" as const },
    select: {
      id: true,
      decision: true,
      snapshotStepSortOrder: true,
      snapshotStepName: true,
      snapshotCapability: true,
      comments: true,
      requestedAt: true,
      decidedAt: true,
      assignedUserId: true,
      department: { select: { id: true, code: true, name: true } },
      approverUser: { select: { id: true, fullName: true } },
    },
  },
  weighments: {
    orderBy: { sequence: "asc" as const },
    select: {
      id: true,
      sequence: true,
      kind: true,
      weightKg: true,
      recordedAt: true,
      source: true,
      recordedByUser: { select: { id: true, fullName: true } },
    },
  },
  documents: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      documentType: true,
      status: true,
      ocrStatus: true,
      originalFileName: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export type TransactionRecord = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export type PublicWeighment = {
  id: string;
  sequence: number;
  kind: string;
  weightKg: string;
  recordedAt: string;
  source: string;
  recordedBy: { id: string; fullName: string };
};

export type PublicTransaction = {
  id: string;
  referenceNumber: string;
  status: string;
  arrivedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  exceptionReason: string | null;
  operationMode: string;
  site: { id: string; code: string; name: string };
  weighbridge: { id: string; code: string; name: string } | null;
  vehicle: {
    id: string;
    registrationNumber: string;
    displayRegistrationNumber: string;
    vehicleType: string | null;
    transporterName: string | null;
  } | null;
  material: { id: string; code: string; name: string; unitOfMeasure: string } | null;
  supplier: { id: string; name: string; code: string | null } | null;
  workflow: {
    code: string;
    name: string;
    requiredApprovals: Array<{ code: string; name: string }>;
    steps: Array<{
      sortOrder: number;
      capability: string;
      name: string;
      isRequired: boolean;
      approvalDepartment: { code: string; name: string } | null;
    }>;
    capturedAt: string;
  } | null;
  materialSource: string | null;
  materialIdentification: {
    status: string;
    verified: boolean;
    verifiedAt: string | null;
    verifiedBy: { id: string; fullName: string } | null;
    ocrMaterialName: string | null;
    ocrConfidence: number | null;
  } | null;
  suggestion: MaterialSuggestion | null;
  operator: { id: string; fullName: string };
  completedBy: { id: string; fullName: string } | null;
  weighments: PublicWeighment[];
  documents: Array<{
    id: string;
    documentType: string;
    status: string;
    ocrStatus: string;
    originalFileName: string;
    createdAt: string;
  }>;
  documentStatus: string | null;
  grossWeightKg: string | null;
  tareWeightKg: string | null;
  netWeightKg: string | null;
  unloading: {
    status: string;
    notes: string | null;
    assignedAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    point: { id: string; code: string; name: string; status: string } | null;
    assignedBy: { id: string; fullName: string } | null;
    startedBy: { id: string; fullName: string } | null;
    completedBy: { id: string; fullName: string } | null;
  } | null;
  instruction: {
    vehicle: string;
    material: string;
    referenceNumber: string;
    pointName: string;
    pointCode: string;
    displayStatus: string;
  } | null;
  nextAction: NextAction;
  approval: { required: boolean; departments: Array<{ code: string; name: string }>; reason: string };
  pendingApproval: { id: string; stepName: string; department: { code: string; name: string } } | null;
  approvals: Array<{
    id: string;
    decision: string;
    stepName: string;
    department: { code: string; name: string };
    requestedAt: string;
    decidedAt: string | null;
  }>;
  allowedActions: TransactionAction[];
  timeline: Array<{ label: string; at: string; status: string }>;
};

export function transactionProgress(record: TransactionRecord): WorkflowProgressContext {
  const gross = record.weighments.find((weighment) => weighment.kind === "GROSS");
  const tare = record.weighments.find((weighment) => weighment.kind === "TARE");
  const pending = record.approvals.find((approval) => approval.decision === ApprovalDecision.PENDING);
  const net =
    record.netWeightKg?.toString() ??
    (gross && tare ? calculateNetWeight(gross.weightKg.toString(), tare.weightKg.toString()).netAsDecimal : null);
  const tareExceedsGross =
    gross !== undefined &&
    tare !== undefined &&
    calculateNetWeight(gross.weightKg.toString(), tare.weightKg.toString()).tareExceedsGross;
  return {
    status: record.status,
    hasVehicle: record.vehicle !== null,
    hasGross: gross !== undefined,
    hasTare: tare !== undefined,
    hasDocument: record.documents.length > 0,
    hasVerifiedDocument: record.documents.some((document) => document.status === "VERIFIED"),
    snapshot: parseWorkflowSnapshot(record.workflowSnapshot),
    grossWeightKg: gross ? Number(gross.weightKg) : null,
    netWeightKg: net,
    tareExceedsGross,
    hasUnloadingPoint: record.unloading?.unloadingPoint !== null && record.unloading?.unloadingPoint !== undefined,
    unloadingStatus: record.unloading?.status ?? null,
    isCompleted: record.status === "COMPLETED" && record.completedAt !== null,
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

export function toPublicTransaction(
  record: TransactionRecord,
  suggestion: MaterialSuggestion | null = null,
): PublicTransaction {
  const weighments = record.weighments.map((weighment) => ({
    id: weighment.id,
    sequence: weighment.sequence,
    kind: weighment.kind,
    weightKg: weighment.weightKg.toString(),
    recordedAt: weighment.recordedAt.toISOString(),
    source: weighment.source,
    recordedBy: weighment.recordedByUser,
  }));

  const gross = weighments.find((weighment) => weighment.kind === "GROSS");
  const tare = weighments.find((weighment) => weighment.kind === "TARE");
  const progress = transactionProgress(record);
  const snapshot = progress.snapshot;
  const approval = resolveApprovalRequirement(snapshot, progress.grossWeightKg);
  const unloading = publicUnloading(record);

  return {
    id: record.id,
    referenceNumber: record.referenceNumber,
    status: record.status,
    arrivedAt: record.arrivedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    exceptionReason: record.exceptionReason,
    operationMode: record.operationMode,
    site: record.site,
    weighbridge: record.weighbridge,
    vehicle: record.vehicle,
    material: record.material,
    supplier: record.supplier,
    workflow: snapshot ? publicWorkflow(snapshot) : null,
    materialSource: record.materialSource,
    materialIdentification: snapshot
      ? {
          status: snapshot.identificationStatus,
          verified: snapshot.verified,
          verifiedAt: snapshot.verifiedAt,
          verifiedBy: record.materialVerifiedByUser,
          ocrMaterialName: snapshot.ocrMaterialName,
          ocrConfidence: snapshot.ocrConfidence,
        }
      : null,
    suggestion,
    operator: record.createdByUser,
    completedBy: record.completedByUser,
    weighments,
    documents: record.documents.map((document) => ({
      id: document.id,
      documentType: document.documentType,
      status: document.status,
      ocrStatus: document.ocrStatus,
      originalFileName: document.originalFileName,
      createdAt: document.createdAt.toISOString(),
    })),
    documentStatus: latestDocumentStatus(record.documents),
    grossWeightKg: gross?.weightKg ?? null,
    tareWeightKg: tare?.weightKg ?? null,
    netWeightKg: record.netWeightKg?.toString() ?? progress.netWeightKg,
    unloading,
    instruction: publicInstruction(record, unloading),
    nextAction: resolveNextAction(progress),
    approval: {
      required: approval.required,
      departments: approval.departments.map((department) => ({ code: department.code, name: department.name })),
      reason: approval.reason,
    },
    pendingApproval: pendingPublicApproval(record),
    approvals: record.approvals.map((item) => ({
      id: item.id,
      decision: item.decision,
      stepName: item.snapshotStepName,
      department: { code: item.department.code, name: item.department.name },
      requestedAt: item.requestedAt.toISOString(),
      decidedAt: item.decidedAt?.toISOString() ?? null,
    })),
    allowedActions: resolveAllowedActions(progress),
    timeline: buildTimeline(record, gross, tare, snapshot),
  };
}

function publicWorkflow(snapshot: WorkflowSnapshot) {
  return {
    code: snapshot.workflow.code,
    name: snapshot.workflow.name,
    requiredApprovals: snapshot.steps.flatMap((step) => {
      if (step.capability !== "APPROVAL" || !step.isRequired || !step.approvalDepartment) {
        return [];
      }
      return [{ code: step.approvalDepartment.code, name: step.approvalDepartment.name }];
    }),
    steps: snapshot.steps.map((step) => ({
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: step.isRequired,
      approvalDepartment: step.approvalDepartment
        ? { code: step.approvalDepartment.code, name: step.approvalDepartment.name }
        : null,
    })),
    capturedAt: snapshot.capturedAt,
  };
}

function publicUnloading(record: TransactionRecord): PublicTransaction["unloading"] {
  if (!record.unloading) {
    return null;
  }

  return {
    status: record.unloading.status,
    notes: record.unloading.notes,
    assignedAt: record.unloading.assignedAt?.toISOString() ?? null,
    startedAt: record.unloading.startedAt?.toISOString() ?? null,
    completedAt: record.unloading.completedAt?.toISOString() ?? null,
    point: record.unloading.unloadingPoint,
    assignedBy: record.unloading.instructedByUser,
    startedBy: record.unloading.startedByUser,
    completedBy: record.unloading.completedByUser,
  };
}

function publicInstruction(
  record: TransactionRecord,
  unloading: PublicTransaction["unloading"],
): PublicTransaction["instruction"] {
  if (!record.vehicle && !unloading?.point) {
    return null;
  }

  let displayStatus = "AWAITING ASSIGNMENT";
  if (record.status === "COMPLETED") {
    displayStatus = "COMPLETED";
  } else if (record.status === "EXCEPTION") {
    displayStatus = "NEEDS REVIEW";
  } else if (unloading?.status === "COMPLETED") {
    displayStatus = "UNLOADED";
  } else if (unloading?.status === "IN_PROGRESS") {
    displayStatus = "UNLOADING";
  } else if (unloading?.point) {
    displayStatus = "READY FOR UNLOADING";
  }

  return {
    vehicle: record.vehicle?.displayRegistrationNumber ?? "Not identified",
    material: record.material?.name ?? "Not identified",
    referenceNumber: record.referenceNumber,
    pointName: unloading?.point?.name ?? "Not assigned",
    pointCode: unloading?.point?.code ?? "—",
    displayStatus,
  };
}

function buildTimeline(
  record: TransactionRecord,
  gross: PublicWeighment | undefined,
  tare: PublicWeighment | undefined,
  snapshot: WorkflowSnapshot | null,
): Array<{ label: string; at: string; status: string }> {
  const items = [{ label: "Vehicle arrived", at: record.arrivedAt.toISOString(), status: "ARRIVED" }];

  if (record.status !== "ARRIVED" && record.vehicle) {
    items.push({
      label: "Vehicle identified",
      at: record.updatedAt.toISOString(),
      status: "IDENTIFIED",
    });
  }

  const uploaded = record.documents[0];
  if (uploaded) {
    items.push({
      label: "Document uploaded",
      at: uploaded.createdAt.toISOString(),
      status: "DOCUMENT_PENDING",
    });
  }

  const verified = [...record.documents].reverse().find((document) => document.status === "VERIFIED");
  if (verified) {
    items.push({
      label: "Document verified",
      at: verified.updatedAt.toISOString(),
      status: "DOCUMENT_VERIFIED",
    });
  }

  if (snapshot) {
    items.push({
      label: `Material assigned: ${snapshot.material.name} (${snapshot.workflow.code})`,
      at: snapshot.capturedAt,
      status: "MATERIAL_CLASSIFIED",
    });
  }

  if (snapshot?.verified && snapshot.verifiedAt) {
    items.push({
      label: "Material verified",
      at: snapshot.verifiedAt,
      status: "MATERIAL_VERIFIED",
    });
  }

  if (gross) {
    items.push({
      label: "First weighment recorded",
      at: gross.recordedAt,
      status: "FIRST_WEIGHMENT",
    });
  }

  if (record.unloading?.assignedAt && record.unloading.unloadingPoint) {
    items.push({
      label: `Unloading point assigned: ${record.unloading.unloadingPoint.code}`,
      at: record.unloading.assignedAt.toISOString(),
      status: "UNLOADING_ASSIGNED",
    });
  }

  if (record.unloading?.startedAt) {
    items.push({
      label: "Unloading started",
      at: record.unloading.startedAt.toISOString(),
      status: "UNLOADING",
    });
  }

  if (record.unloading?.completedAt) {
    items.push({
      label: "Unloading completed",
      at: record.unloading.completedAt.toISOString(),
      status: "UNLOADED",
    });
  }

  if (tare) {
    items.push({
      label: "Second weighment recorded",
      at: tare.recordedAt,
      status: "SECOND_WEIGHMENT",
    });
  }

  if (record.netWeightKg && tare) {
    items.push({
      label: "Net weight calculated",
      at: tare.recordedAt,
      status: "NET_WEIGHT",
    });
  }

  if (record.completedAt) {
    items.push({
      label: "Transaction completed",
      at: record.completedAt.toISOString(),
      status: "COMPLETED",
    });
  }

  return items;
}

function pendingPublicApproval(
  record: TransactionRecord,
): { id: string; stepName: string; department: { code: string; name: string } } | null {
  const pending = record.approvals.find((approval) => approval.decision === ApprovalDecision.PENDING);
  if (!pending) {
    return null;
  }

  return {
    id: pending.id,
    stepName: pending.snapshotStepName,
    department: { code: pending.department.code, name: pending.department.name },
  };
}

function latestDocumentStatus(documents: TransactionRecord["documents"]): string | null {
  const latest = documents[documents.length - 1];
  return latest?.status ?? null;
}
