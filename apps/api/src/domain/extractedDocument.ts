import { compareVehicleNumbers, type VehicleComparison } from "./vehicleComparison.js";

export const OCR_FIELD_NAMES = [
  "invoiceNumber",
  "vehicleNumber",
  "supplierName",
  "materialName",
  "quantity",
  "documentDate",
] as const;

export type OcrFieldName = (typeof OCR_FIELD_NAMES)[number];

export type StoredOcrField = {
  name: OcrFieldName;
  value: string;
  confidence: number;
  originalValue: string;
  corrected: boolean;
};

export type StoredOcrResult = {
  provider: string;
  source: "SIMULATED";
  processedAt: string;
  rawText: string;
  fields: StoredOcrField[];
};

export type StoredFileMeta = {
  sizeBytes: number;
  storageProvider: string;
};

export type ExtractedDocumentData = {
  version: 1;
  file: StoredFileMeta;
  ocr: StoredOcrResult | null;
  vehicleComparison: VehicleComparison | null;
};

export function createUploadedExtractedData(file: StoredFileMeta): ExtractedDocumentData {
  return {
    version: 1,
    file,
    ocr: null,
    vehicleComparison: null,
  };
}

export function fieldValue(data: ExtractedDocumentData | null, name: OcrFieldName): string | null {
  const field = data?.ocr?.fields.find((item) => item.name === name);
  if (!field || field.value.trim() === "") {
    return null;
  }

  return field.value;
}

export function applyOcrResult(
  current: ExtractedDocumentData,
  ocr: StoredOcrResult,
  comparisonInput: {
    anprVehicleNumber?: string | null | undefined;
    registeredVehicleNumber?: string | null | undefined;
  },
): ExtractedDocumentData {
  const vehicleNumber = ocr.fields.find((field) => field.name === "vehicleNumber")?.value ?? null;
  return {
    ...current,
    ocr,
    vehicleComparison: compareVehicleNumbers({
      anprVehicleNumber: comparisonInput.anprVehicleNumber,
      ocrVehicleNumber: vehicleNumber,
      registeredVehicleNumber: comparisonInput.registeredVehicleNumber,
    }),
  };
}

export function applyFieldCorrections(
  current: ExtractedDocumentData,
  corrections: Partial<Record<OcrFieldName, string>>,
  comparisonInput: {
    anprVehicleNumber?: string | null | undefined;
    registeredVehicleNumber?: string | null | undefined;
  },
): ExtractedDocumentData {
  if (!current.ocr) {
    throw new Error("OCR results are not available to correct");
  }

  const fields = current.ocr.fields.map((field) => {
    const nextValue = corrections[field.name];
    if (nextValue === undefined) {
      return field;
    }

    const trimmed = nextValue.trim();
    return {
      ...field,
      value: trimmed,
      corrected: trimmed !== field.originalValue,
    };
  });

  const vehicleNumber = fields.find((field) => field.name === "vehicleNumber")?.value ?? null;

  return {
    ...current,
    ocr: {
      ...current.ocr,
      fields,
    },
    vehicleComparison: compareVehicleNumbers({
      anprVehicleNumber: comparisonInput.anprVehicleNumber ?? current.vehicleComparison?.anprVehicleNumber,
      ocrVehicleNumber: vehicleNumber,
      registeredVehicleNumber:
        comparisonInput.registeredVehicleNumber ?? current.vehicleComparison?.registeredVehicleNumber,
    }),
  };
}

export function parseExtractedDocumentData(value: unknown): ExtractedDocumentData | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.file !== "object" || record.file === null) {
    return null;
  }

  const file = record.file as Record<string, unknown>;
  if (typeof file.sizeBytes !== "number" || typeof file.storageProvider !== "string") {
    return null;
  }

  return {
    version: 1,
    file: {
      sizeBytes: file.sizeBytes,
      storageProvider: file.storageProvider,
    },
    ocr: parseStoredOcr(record.ocr),
    vehicleComparison: parseVehicleComparison(record.vehicleComparison),
  };
}

function parseStoredOcr(value: unknown): StoredOcrResult | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.provider !== "string" ||
    record.source !== "SIMULATED" ||
    typeof record.processedAt !== "string" ||
    typeof record.rawText !== "string" ||
    !Array.isArray(record.fields)
  ) {
    return null;
  }

  const fields: StoredOcrField[] = [];
  for (const item of record.fields) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const field = item as Record<string, unknown>;
    if (!isOcrFieldName(field.name) || typeof field.value !== "string" || typeof field.confidence !== "number") {
      continue;
    }
    fields.push({
      name: field.name,
      value: field.value,
      confidence: field.confidence,
      originalValue: typeof field.originalValue === "string" ? field.originalValue : field.value,
      corrected: field.corrected === true,
    });
  }

  return {
    provider: record.provider,
    source: "SIMULATED",
    processedAt: record.processedAt,
    rawText: record.rawText,
    fields,
  };
}

function parseVehicleComparison(value: unknown): VehicleComparison | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.result !== "MATCH" && record.result !== "NEEDS_REVIEW") {
    return null;
  }

  return {
    anprVehicleNumber: optionalString(record.anprVehicleNumber),
    ocrVehicleNumber: optionalString(record.ocrVehicleNumber),
    registeredVehicleNumber: optionalString(record.registeredVehicleNumber),
    result: record.result,
    comparedAt: typeof record.comparedAt === "string" ? record.comparedAt : new Date(0).toISOString(),
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function isOcrFieldName(value: unknown): value is OcrFieldName {
  return typeof value === "string" && (OCR_FIELD_NAMES as readonly string[]).includes(value);
}
