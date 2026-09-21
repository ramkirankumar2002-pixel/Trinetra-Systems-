import { apiRequest } from "../../shared/api/client.ts";

export type DocumentTypeOption = {
  code: string;
  label: string;
};

export type PublicOcrField = {
  name: string;
  value: string;
  confidence: number;
  originalValue: string;
  corrected: boolean;
  lowConfidence: boolean;
};

export type VehicleComparison = {
  anprVehicleNumber: string | null;
  ocrVehicleNumber: string | null;
  registeredVehicleNumber: string | null;
  result: "MATCH" | "NEEDS_REVIEW";
  comparedAt: string;
};

export type PublicDocument = {
  id: string;
  transactionId: string;
  documentType: string;
  documentTypeLabel: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number | null;
  status: string;
  ocrStatus: string;
  simulatedOcr: boolean;
  uploadedBy: { id: string; fullName: string };
  verifiedBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  ocr: {
    provider: string;
    source: "SIMULATED";
    processedAt: string;
    rawText: string;
    fields: PublicOcrField[];
  } | null;
  vehicleComparison: VehicleComparison | null;
  allowedActions: Array<"process" | "review" | "verify" | "reject">;
};

export function listDocumentTypes(): Promise<{ documentTypes: DocumentTypeOption[] }> {
  return apiRequest<{ documentTypes: DocumentTypeOption[] }>("/api/v1/document-types");
}

export function listTransactionDocuments(transactionId: string): Promise<{ documents: PublicDocument[] }> {
  return apiRequest<{ documents: PublicDocument[] }>(`/api/v1/transactions/${transactionId}/documents`);
}

export function uploadTransactionDocument(
  transactionId: string,
  file: File,
  documentType: string,
): Promise<{ document: PublicDocument }> {
  const body = new FormData();
  body.append("documentType", documentType);
  body.append("file", file);
  return apiRequest<{ document: PublicDocument }>(`/api/v1/transactions/${transactionId}/documents`, {
    method: "POST",
    body,
  });
}

export function processDocument(
  documentId: string,
  input: { anprVehicleNumber?: string; forceVehicleMismatch?: boolean } = {},
): Promise<{ document: PublicDocument; simulated: true }> {
  return apiRequest<{ document: PublicDocument; simulated: true }>(`/api/v1/documents/${documentId}/process`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reviewDocument(
  documentId: string,
  fields: Record<string, string>,
  anprVehicleNumber?: string,
): Promise<{ document: PublicDocument }> {
  return apiRequest<{ document: PublicDocument }>(`/api/v1/documents/${documentId}/review`, {
    method: "PATCH",
    body: JSON.stringify(anprVehicleNumber === undefined ? { fields } : { fields, anprVehicleNumber }),
  });
}

export function verifyDocument(
  documentId: string,
  decision: "VERIFIED" | "REJECTED",
  note?: string,
): Promise<{ document: PublicDocument }> {
  return apiRequest<{ document: PublicDocument }>(`/api/v1/documents/${documentId}/verification`, {
    method: "PATCH",
    body: JSON.stringify(note === undefined ? { decision } : { decision, note }),
  });
}

export function ocrFieldLabel(name: string): string {
  switch (name) {
    case "invoiceNumber":
      return "Invoice number";
    case "vehicleNumber":
      return "Vehicle number";
    case "supplierName":
      return "Supplier";
    case "materialName":
      return "Material";
    case "quantity":
      return "Quantity";
    case "documentDate":
      return "Document date";
    default:
      return name;
  }
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export async function downloadDocumentFile(documentId: string, fileName: string): Promise<void> {
  const response = await fetch(`/api/v1/documents/${documentId}/file`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw { status: response.status, message: "Unable to download document" };
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
