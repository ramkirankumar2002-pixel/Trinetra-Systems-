import { TransactionStatus, WeighmentKind, WeighmentSource } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";

export type CreateTransactionInput = {
  weighbridgeId: string;
  siteId?: string | undefined;
};

export type IdentifyTransactionInput = {
  vehicleId: string;
};

export type RecordWeighmentInput = {
  weightKg: unknown;
  source: WeighmentSource;
  weighbridgeId?: string | undefined;
  kind?: WeighmentKind | undefined;
};

export type AssignUnloadingInput = {
  unloadingPointId?: string | undefined;
};

export type CompleteUnloadingInput = {
  notes?: string | undefined;
};

export type CorrectionInput = {
  field: string;
  originalValue: string;
  proposedValue: string;
  reason: string;
};

export function parseCreateTransactionInput(body: unknown): CreateTransactionInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A weighbridge is required");
  }

  const record = body as Record<string, unknown>;
  const weighbridgeId = requiredId(record.weighbridgeId, "weighbridge");
  const siteId = typeof record.siteId === "string" && record.siteId !== "" ? record.siteId : undefined;

  return siteId === undefined ? { weighbridgeId } : { weighbridgeId, siteId };
}

export type AssignMaterialInput = {
  materialId?: string | undefined;
  source: "MANUAL" | "OCR";
  documentId?: string | undefined;
};

export type VerifyMaterialInput = {
  materialId?: string | undefined;
};

export function parseAssignMaterialInput(body: unknown): AssignMaterialInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Material details are required");
  }

  const record = body as Record<string, unknown>;
  const source = record.source === "OCR" ? "OCR" : "MANUAL";
  const materialId =
    typeof record.materialId === "string" && record.materialId.trim() !== "" ? record.materialId.trim() : undefined;
  const documentId =
    typeof record.documentId === "string" && record.documentId.trim() !== "" ? record.documentId.trim() : undefined;

  if (source === "MANUAL" && materialId === undefined) {
    throw new HttpError(400, "A material is required");
  }

  return {
    source,
    ...(materialId === undefined ? {} : { materialId }),
    ...(documentId === undefined ? {} : { documentId }),
  };
}

export function parseVerifyMaterialInput(body: unknown): VerifyMaterialInput {
  if (body === undefined || body === null || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Material verification details are invalid");
  }
  const record = body as Record<string, unknown>;
  const materialId =
    typeof record.materialId === "string" && record.materialId.trim() !== "" ? record.materialId.trim() : undefined;
  return materialId === undefined ? {} : { materialId };
}

export function parseIdentifyInput(body: unknown): IdentifyTransactionInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A vehicle is required");
  }

  const record = body as Record<string, unknown>;
  return { vehicleId: requiredId(record.vehicleId, "vehicle") };
}

export function parseWeighmentInput(body: unknown): RecordWeighmentInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A weight is required");
  }

  const record = body as Record<string, unknown>;
  const source = record.source;
  if (source !== WeighmentSource.MANUAL && source !== WeighmentSource.SIMULATED) {
    throw new HttpError(400, "Weighment source must be MANUAL or SIMULATED");
  }

  const weighbridgeId =
    typeof record.weighbridgeId === "string" && record.weighbridgeId !== "" ? record.weighbridgeId : undefined;
  const kind =
    record.kind === WeighmentKind.GROSS || record.kind === WeighmentKind.TARE ? record.kind : undefined;

  return {
    weightKg: record.weightKg,
    source,
    ...(weighbridgeId === undefined ? {} : { weighbridgeId }),
    ...(kind === undefined ? {} : { kind }),
  };
}

export function parseAssignUnloadingInput(body: unknown): AssignUnloadingInput {
  if (body === undefined || body === null || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Unloading assignment details are invalid");
  }
  const record = body as Record<string, unknown>;
  const unloadingPointId =
    typeof record.unloadingPointId === "string" && record.unloadingPointId.trim() !== ""
      ? record.unloadingPointId.trim()
      : undefined;
  return unloadingPointId === undefined ? {} : { unloadingPointId };
}

export function parseCompleteUnloadingInput(body: unknown): CompleteUnloadingInput {
  if (body === undefined || body === null || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Unloading completion details are invalid");
  }
  const record = body as Record<string, unknown>;
  if (record.notes === undefined) {
    return {};
  }
  if (typeof record.notes !== "string") {
    throw new HttpError(400, "Notes must be text");
  }
  const notes = record.notes.trim();
  return notes === "" ? {} : { notes };
}

export function parseCorrectionInput(body: unknown): CorrectionInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Correction details are required");
  }
  const record = body as Record<string, unknown>;
  const field = requiredText(record.field, "field");
  const originalValue = requiredText(record.originalValue, "original value");
  const proposedValue = requiredText(record.proposedValue, "corrected value");
  const reason = requiredText(record.reason, "reason");
  if (reason.length < 8) {
    throw new HttpError(400, "A correction reason of at least 8 characters is required");
  }
  return { field, originalValue, proposedValue, reason };
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A ${field} is required`);
  }
  return value.trim();
}

export function parseStatusFilter(value: unknown): TransactionStatus | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !Object.values(TransactionStatus).includes(value as TransactionStatus)) {
    throw new HttpError(400, "Invalid transaction status");
  }

  return value as TransactionStatus;
}

export function parseOptionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a date`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`);
  }

  return parsed;
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A ${field} is required`);
  }

  return value.trim();
}
