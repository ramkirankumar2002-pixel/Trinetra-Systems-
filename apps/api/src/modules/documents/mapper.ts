import type { Document, DocumentStatus, OcrStatus } from "@prisma/client";
import { documentTypeLabel } from "../../domain/documentTypes.js";
import {
  parseExtractedDocumentData,
  type ExtractedDocumentData,
  type StoredOcrField,
} from "../../domain/extractedDocument.js";
import type { VehicleComparison } from "../../domain/vehicleComparison.js";

export type DocumentAction = "process" | "review" | "verify" | "reject";

export type PublicOcrField = StoredOcrField & {
  lowConfidence: boolean;
};

export type PublicDocument = {
  id: string;
  transactionId: string;
  documentType: string;
  documentTypeLabel: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number | null;
  status: DocumentStatus;
  ocrStatus: OcrStatus;
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
  allowedActions: DocumentAction[];
};

type DocumentRecord = Document & {
  uploadedByUser: { id: string; fullName: string };
  verifiedByUser: { id: string; fullName: string } | null;
};

export const documentInclude = {
  uploadedByUser: { select: { id: true, fullName: true } },
  verifiedByUser: { select: { id: true, fullName: true } },
} as const;

export function toPublicDocument(record: DocumentRecord): PublicDocument {
  const extracted = parseExtractedDocumentData(record.extractedData);
  return {
    id: record.id,
    transactionId: record.transactionId,
    documentType: record.documentType,
    documentTypeLabel: documentTypeLabel(record.documentType),
    originalFileName: record.originalFileName,
    mimeType: record.mimeType,
    fileSize: extracted?.file.sizeBytes ?? null,
    status: record.status,
    ocrStatus: record.ocrStatus,
    simulatedOcr: record.ocrStatus === "SIMULATED" || extracted?.ocr?.source === "SIMULATED",
    uploadedBy: record.uploadedByUser,
    verifiedBy: record.verifiedByUser,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ocr: extracted?.ocr
      ? {
          provider: extracted.ocr.provider,
          source: extracted.ocr.source,
          processedAt: extracted.ocr.processedAt,
          rawText: extracted.ocr.rawText,
          fields: extracted.ocr.fields.map((field) => ({
            ...field,
            lowConfidence: field.confidence < 0.9,
          })),
        }
      : null,
    vehicleComparison: extracted?.vehicleComparison ?? null,
    allowedActions: documentAllowedActions(record.status, record.ocrStatus),
  };
}

export function documentAllowedActions(status: DocumentStatus, ocrStatus: OcrStatus): DocumentAction[] {
  const actions: DocumentAction[] = [];
  if (status === "UPLOADED" || ocrStatus === "FAILED") {
    actions.push("process");
  }
  if (status === "EXTRACTED") {
    actions.push("review", "verify", "reject");
  }
  return actions;
}

export function readExtractedData(record: Pick<Document, "extractedData">): ExtractedDocumentData | null {
  return parseExtractedDocumentData(record.extractedData);
}
