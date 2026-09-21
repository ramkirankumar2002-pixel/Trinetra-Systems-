import { apiRequest } from "../../shared/api/client.ts";

export type TransactionAction =
  | "identify"
  | "record_gross"
  | "upload_document"
  | "assign_material"
  | "verify_material"
  | "assign_unloading"
  | "start_unloading"
  | "complete_unloading"
  | "record_tare"
  | "finalize";

export type NextAction = {
  code: string;
  label: string;
  blocking: boolean;
  approvalId?: string;
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
  operationMode?: string;
  site: { id: string; code: string; name: string };
  weighbridge: { id: string; code: string; name: string } | null;
  vehicle: {
    id: string;
    registrationNumber: string;
    displayRegistrationNumber: string;
    vehicleType: string | null;
    transporterName: string | null;
  } | null;
  operator: { id: string; fullName: string };
  completedBy: { id: string; fullName: string } | null;
  weighments: Array<{
    id: string;
    sequence: number;
    kind: string;
    weightKg: string;
    recordedAt: string;
    source: string;
    recordedBy: { id: string; fullName: string };
  }>;
  documents: Array<{
    id: string;
    documentType: string;
    status: string;
    ocrStatus: string;
    originalFileName: string;
    createdAt: string;
  }>;
  documentStatus: string | null;
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
  suggestion: {
    status: string;
    reason: string;
    ocrMaterialName: string | null;
    ocrConfidence: number | null;
    material: { id: string; code: string; name: string } | null;
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
  allowedActions: TransactionAction[];
  timeline: Array<{ label: string; at: string; status: string }>;
};

export type TimelineItem = {
  label: string;
  at: string;
  status: string;
  source: "entity" | "audit";
};

export type TransactionListResponse = {
  items: PublicTransaction[];
  page: number;
  pageSize: number;
  total: number;
};

export function listTransactions(search: URLSearchParams): Promise<TransactionListResponse> {
  return apiRequest<TransactionListResponse>(`/api/v1/transactions?${search.toString()}`);
}

export function getTransaction(id: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}`);
}

export function getTransactionTimeline(id: string): Promise<{ items: TimelineItem[] }> {
  return apiRequest<{ items: TimelineItem[] }>(`/api/v1/transactions/${id}/timeline`);
}

export function createArrival(weighbridgeId: string, vehicleId: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>("/api/v1/transactions/arrival", {
    method: "POST",
    body: JSON.stringify({ weighbridgeId, vehicleId }),
  });
}

export function createTransaction(weighbridgeId: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>("/api/v1/transactions", {
    method: "POST",
    body: JSON.stringify({ weighbridgeId }),
  });
}

export function identifyTransaction(
  id: string,
  vehicleId: string,
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/identify`, {
    method: "POST",
    body: JSON.stringify({ vehicleId }),
  });
}

export function assignTransactionMaterial(
  id: string,
  payload: { materialId?: string; source: "MANUAL" | "OCR"; documentId?: string },
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/material`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyTransactionMaterial(
  id: string,
  payload: { materialId?: string } = {},
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/material/verify`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordGrossWeighment(
  id: string,
  payload: { weightKg: string; source: "MANUAL" | "SIMULATED"; weighbridgeId?: string; kind?: "GROSS" | "TARE" },
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/weighments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordWeighmentFromDevice(
  id: string,
  kind?: "GROSS" | "TARE",
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/weighments/from-device`, {
    method: "POST",
    body: JSON.stringify(kind ? { kind } : {}),
  });
}

export function assignUnloading(
  id: string,
  unloadingPointId?: string,
): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/assign-unloading`, {
    method: "POST",
    body: JSON.stringify(unloadingPointId ? { unloadingPointId } : {}),
  });
}

export function startUnloading(id: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/start-unloading`, {
    method: "POST",
  });
}

export function completeUnloading(id: string, notes?: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/complete-unloading`, {
    method: "POST",
    body: JSON.stringify(notes ? { notes } : {}),
  });
}

export function finalizeTransaction(id: string): Promise<{ transaction: PublicTransaction }> {
  return apiRequest<{ transaction: PublicTransaction }>(`/api/v1/transactions/${id}/finalize`, {
    method: "POST",
  });
}

export function requestTransactionCorrection(
  id: string,
  payload: { field: string; originalValue: string; proposedValue: string; reason: string },
): Promise<{ correction: { id: string; status: string } }> {
  return apiRequest<{ correction: { id: string; status: string } }>(`/api/v1/transactions/${id}/corrections`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
