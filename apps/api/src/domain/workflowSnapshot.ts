import { WorkflowCapability } from "@prisma/client";

export type MaterialIdentificationStatus = "MATCHED" | "NEEDS_REVIEW";
export type MaterialSource = "MANUAL" | "OCR";

export type SnapshotApprovalDepartment = {
  id: string;
  code: string;
  name: string;
};

export type SnapshotWorkflowStep = {
  sortOrder: number;
  capability: WorkflowCapability;
  name: string;
  isRequired: boolean;
  approvalDepartment: SnapshotApprovalDepartment | null;
};

export type SnapshotWorkflowConfig = {
  autoContinue: boolean;
  approvalThresholdKg: number | null;
};

export type WorkflowSnapshot = {
  version: 1;
  capturedAt: string;
  assignmentId: string | null;
  material: {
    id: string;
    code: string;
    name: string;
    unitOfMeasure: string;
  };
  workflow: {
    id: string;
    code: string;
    name: string;
  };
  config: SnapshotWorkflowConfig;
  steps: SnapshotWorkflowStep[];
  source: MaterialSource;
  ocrMaterialName: string | null;
  ocrConfidence: number | null;
  identificationStatus: MaterialIdentificationStatus;
  verified: boolean;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
};

export function buildWorkflowSnapshot(input: {
  assignmentId: string | null;
  material: WorkflowSnapshot["material"];
  workflow: WorkflowSnapshot["workflow"];
  config: SnapshotWorkflowConfig;
  steps: SnapshotWorkflowStep[];
  source: MaterialSource;
  ocrMaterialName: string | null;
  ocrConfidence: number | null;
  identificationStatus: MaterialIdentificationStatus;
  verified?: boolean | undefined;
  verifiedAt?: string | null | undefined;
  verifiedByUserId?: string | null | undefined;
}): WorkflowSnapshot {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    assignmentId: input.assignmentId,
    material: input.material,
    workflow: input.workflow,
    config: input.config,
    steps: [...input.steps].sort((left, right) => left.sortOrder - right.sortOrder),
    source: input.source,
    ocrMaterialName: input.ocrMaterialName,
    ocrConfidence: input.ocrConfidence,
    identificationStatus: input.identificationStatus,
    verified: input.verified === true,
    verifiedAt: input.verifiedAt ?? null,
    verifiedByUserId: input.verifiedByUserId ?? null,
  };
}

export function parseWorkflowConfig(value: unknown): SnapshotWorkflowConfig {
  if (typeof value !== "object" || value === null) {
    return { autoContinue: false, approvalThresholdKg: null };
  }

  const record = value as Record<string, unknown>;
  const threshold =
    typeof record.approvalThresholdKg === "number" && Number.isFinite(record.approvalThresholdKg)
      ? record.approvalThresholdKg
      : null;

  return {
    autoContinue: record.autoContinue === true,
    approvalThresholdKg: threshold !== null && threshold > 0 ? threshold : null,
  };
}

export function requiredApprovalDepartments(snapshot: WorkflowSnapshot): SnapshotApprovalDepartment[] {
  return snapshot.steps
    .filter((step) => step.capability === WorkflowCapability.APPROVAL && step.isRequired)
    .map((step) => step.approvalDepartment)
    .filter((department): department is SnapshotApprovalDepartment => department !== null);
}

export function snapshotRequiresApproval(snapshot: WorkflowSnapshot): boolean {
  return requiredApprovalDepartments(snapshot).length > 0;
}

export function parseWorkflowSnapshot(value: unknown): WorkflowSnapshot | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.workflow !== "object" || record.workflow === null) {
    return null;
  }

  const workflow = record.workflow as Record<string, unknown>;
  const material = record.material as Record<string, unknown> | undefined;
  if (typeof workflow.id !== "string" || typeof workflow.code !== "string" || typeof workflow.name !== "string") {
    return null;
  }
  if (!material || typeof material.id !== "string" || typeof material.code !== "string" || typeof material.name !== "string") {
    return null;
  }

  return {
    version: 1,
    capturedAt: typeof record.capturedAt === "string" ? record.capturedAt : new Date(0).toISOString(),
    assignmentId: typeof record.assignmentId === "string" ? record.assignmentId : null,
    material: {
      id: material.id,
      code: material.code,
      name: material.name,
      unitOfMeasure: typeof material.unitOfMeasure === "string" ? material.unitOfMeasure : "MT",
    },
    workflow: {
      id: workflow.id,
      code: workflow.code,
      name: workflow.name,
    },
    config: parseWorkflowConfig(record.config),
    steps: parseSteps(record.steps),
    source: record.source === "OCR" ? "OCR" : "MANUAL",
    ocrMaterialName: typeof record.ocrMaterialName === "string" ? record.ocrMaterialName : null,
    ocrConfidence: typeof record.ocrConfidence === "number" ? record.ocrConfidence : null,
    identificationStatus: record.identificationStatus === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "MATCHED",
    verified: record.verified === true,
    verifiedAt: typeof record.verifiedAt === "string" ? record.verifiedAt : null,
    verifiedByUserId: typeof record.verifiedByUserId === "string" ? record.verifiedByUserId : null,
  };
}

function parseSteps(value: unknown): SnapshotWorkflowStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const steps: SnapshotWorkflowStep[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const step = item as Record<string, unknown>;
    if (typeof step.sortOrder !== "number" || typeof step.name !== "string" || !isCapability(step.capability)) {
      continue;
    }
    steps.push({
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: step.isRequired !== false,
      approvalDepartment: parseDepartment(step.approvalDepartment),
    });
  }

  return steps.sort((left, right) => left.sortOrder - right.sortOrder);
}

function parseDepartment(value: unknown): SnapshotApprovalDepartment | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.code !== "string" || typeof record.name !== "string") {
    return null;
  }
  return { id: record.id, code: record.code, name: record.name };
}

function isCapability(value: unknown): value is WorkflowCapability {
  return typeof value === "string" && (Object.values(WorkflowCapability) as string[]).includes(value);
}
