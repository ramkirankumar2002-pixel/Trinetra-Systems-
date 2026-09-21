import { OCR_FIELD_NAMES, type OcrFieldName } from "../../domain/extractedDocument.js";
import { isAllowedDocumentType, normalizeDocumentType } from "../../domain/documentTypes.js";
import { HttpError } from "../../lib/httpError.js";

export type ProcessDocumentInput = {
  anprVehicleNumber?: string | undefined;
  forceVehicleMismatch: boolean;
};

export type ReviewDocumentInput = {
  fields: Partial<Record<OcrFieldName, string>>;
  anprVehicleNumber?: string | undefined;
};

export type VerifyDocumentInput = {
  decision: "VERIFIED" | "REJECTED";
  note?: string | undefined;
};

export function parseDocumentTypeInput(value: unknown, catalog: readonly string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "A document type is required");
  }

  const code = normalizeDocumentType(value);
  if (!isAllowedDocumentType(code, catalog)) {
    throw new HttpError(400, "This document type is not configured");
  }

  return code;
}

export function parseProcessDocumentInput(body: unknown): ProcessDocumentInput {
  if (body === undefined || body === null || body === "") {
    return { forceVehicleMismatch: false };
  }

  if (typeof body !== "object") {
    throw new HttpError(400, "Invalid OCR processing request");
  }

  const record = body as Record<string, unknown>;
  const anprVehicleNumber =
    typeof record.anprVehicleNumber === "string" && record.anprVehicleNumber.trim() !== ""
      ? record.anprVehicleNumber.trim()
      : undefined;

  return {
    ...(anprVehicleNumber === undefined ? {} : { anprVehicleNumber }),
    forceVehicleMismatch: record.forceVehicleMismatch === true,
  };
}

export function parseReviewDocumentInput(body: unknown): ReviewDocumentInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Corrected document fields are required");
  }

  const record = body as Record<string, unknown>;
  const fields: Partial<Record<OcrFieldName, string>> = {};
  const source =
    typeof record.fields === "object" && record.fields !== null
      ? (record.fields as Record<string, unknown>)
      : record;

  for (const name of OCR_FIELD_NAMES) {
    const value = source[name];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== "string") {
      throw new HttpError(400, `${name} must be text`);
    }
    fields[name] = value;
  }

  if (Object.keys(fields).length === 0) {
    throw new HttpError(400, "At least one extracted field must be provided");
  }

  const anprVehicleNumber =
    typeof record.anprVehicleNumber === "string" && record.anprVehicleNumber.trim() !== ""
      ? record.anprVehicleNumber.trim()
      : undefined;

  return anprVehicleNumber === undefined ? { fields } : { fields, anprVehicleNumber };
}

export function parseVerifyDocumentInput(body: unknown): VerifyDocumentInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A verification decision is required");
  }

  const record = body as Record<string, unknown>;
  if (record.decision !== "VERIFIED" && record.decision !== "REJECTED") {
    throw new HttpError(400, "Decision must be VERIFIED or REJECTED");
  }

  const note = typeof record.note === "string" && record.note.trim() !== "" ? record.note.trim() : undefined;
  return note === undefined ? { decision: record.decision } : { decision: record.decision, note };
}
