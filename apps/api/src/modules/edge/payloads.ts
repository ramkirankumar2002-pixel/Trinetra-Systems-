import { HardwareDeviceStatus, WeighmentKind, WeighmentSource, WeightQuality } from "@prisma/client";
import { isWeightUnit } from "../../domain/weightUnits.js";
import { HttpError } from "../../lib/httpError.js";

export type WeightEventPayload = {
  weightKg: string | null;
  unit: string;
  quality: WeightQuality;
  connectionStatus: HardwareDeviceStatus;
  source: WeighmentSource;
  transactionId: string | null;
  localTransactionId: string | null;
  kind: WeighmentKind | null;
  captureOfficial: boolean;
  localAnomalyEvaluated: boolean;
};

export type AnprEventPayload = {
  plateNumber: string | null;
  normalizedPlateNumber: string | null;
  displayPlateNumber: string | null;
  confidence: number | null;
  candidates: Array<{ plateNumber: string; normalizedPlateNumber: string; confidence: number }>;
  countryRegion: string | null;
  boundingBox: unknown;
  processingDurationMs: number;
  simulated: boolean;
  provider: string;
  evidenceBase64: string | null;
  evidenceMimeType: string | null;
};

export type ScanEventPayload = {
  fileName: string;
  mimeType: string;
  contentBase64: string | null;
  documentType: string | null;
  transactionId: string | null;
  localTransactionId: string | null;
  fileId: string | null;
  contentHash: string | null;
};

export type StatusEventPayload = {
  status: HardwareDeviceStatus;
  lastError: string | null;
  summary: Record<string, unknown> | null;
};

export function parseWeightPayload(payload: Record<string, unknown>): WeightEventPayload {
  const quality = asEnum(payload.quality, WeightQuality, "weight quality");
  const connectionStatus = asEnum(
    payload.connectionStatus ?? payload.status,
    HardwareDeviceStatus,
    "connection status",
  );
  const source =
    payload.source === "HARDWARE" ? WeighmentSource.HARDWARE : WeighmentSource.SIMULATED;
  const unit = typeof payload.unit === "string" && isWeightUnit(payload.unit) ? payload.unit : "KG";
  const weightKg =
    payload.weightKg === null || payload.weightKg === undefined
      ? null
      : typeof payload.weightKg === "number" || typeof payload.weightKg === "string"
        ? String(payload.weightKg)
        : null;
  const kind =
    payload.kind === "TARE" ? WeighmentKind.TARE : payload.kind === "GROSS" ? WeighmentKind.GROSS : null;

  return {
    weightKg,
    unit,
    quality,
    connectionStatus,
    source,
    transactionId: optionalId(payload.transactionId),
    localTransactionId: optionalId(payload.localTransactionId),
    kind,
    captureOfficial: payload.captureOfficial === true,
    localAnomalyEvaluated: payload.localAnomalyEvaluated === true,
  };
}

export function parseAnprPayload(payload: Record<string, unknown>): AnprEventPayload {
  const confidence =
    typeof payload.confidence === "number" && Number.isFinite(payload.confidence)
      ? payload.confidence
      : null;
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates.flatMap((item) => {
        if (typeof item !== "object" || item === null) {
          return [];
        }
        const row = item as Record<string, unknown>;
        if (typeof row.plateNumber !== "string") {
          return [];
        }
        return [
          {
            plateNumber: row.plateNumber,
            normalizedPlateNumber:
              typeof row.normalizedPlateNumber === "string" ? row.normalizedPlateNumber : row.plateNumber,
            confidence: typeof row.confidence === "number" ? row.confidence : 0,
          },
        ];
      })
    : [];

  return {
    plateNumber: optionalText(payload.plateNumber),
    normalizedPlateNumber: optionalText(payload.normalizedPlateNumber),
    displayPlateNumber: optionalText(payload.displayPlateNumber),
    confidence,
    candidates,
    countryRegion: optionalText(payload.countryRegion),
    boundingBox: payload.boundingBox ?? null,
    processingDurationMs:
      typeof payload.processingDurationMs === "number" && Number.isFinite(payload.processingDurationMs)
        ? payload.processingDurationMs
        : 0,
    simulated: payload.simulated !== false,
    provider: typeof payload.provider === "string" && payload.provider !== "" ? payload.provider : "EDGE",
    evidenceBase64: optionalText(payload.evidenceBase64),
    evidenceMimeType: optionalText(payload.evidenceMimeType),
  };
}

export function parseScanPayload(payload: Record<string, unknown>): ScanEventPayload {
  if (typeof payload.fileName !== "string" || payload.fileName.trim() === "") {
    throw new HttpError(400, "A scan file name is required");
  }
  if (typeof payload.mimeType !== "string" || payload.mimeType.trim() === "") {
    throw new HttpError(400, "A scan MIME type is required");
  }
  const contentBase64 =
    typeof payload.contentBase64 === "string" && payload.contentBase64.trim() !== ""
      ? payload.contentBase64
      : null;
  const fileId = optionalId(payload.fileId);
  const contentHash = optionalText(payload.contentHash);
  if (!contentBase64 && !fileId && !contentHash) {
    throw new HttpError(400, "Scan content is required");
  }
  return {
    fileName: payload.fileName.trim(),
    mimeType: payload.mimeType.trim(),
    contentBase64,
    documentType: optionalText(payload.documentType),
    transactionId: optionalId(payload.transactionId),
    localTransactionId: optionalId(payload.localTransactionId),
    fileId,
    contentHash,
  };
}

export function parseStatusPayload(payload: Record<string, unknown>): StatusEventPayload {
  return {
    status: asEnum(payload.status, HardwareDeviceStatus, "device status"),
    lastError: optionalText(payload.lastError),
    summary: isRecord(payload.summary) ? payload.summary : null,
  };
}

function asEnum<T extends Record<string, string>>(
  value: unknown,
  enumeration: T,
  field: string,
): T[keyof T] {
  if (typeof value !== "string" || !Object.values(enumeration).includes(value)) {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  return value as T[keyof T];
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
