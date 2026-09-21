import path from "node:path";
import { DEFAULT_DOCUMENT_TYPES, validateDocumentTypeCatalog } from "../domain/documentTypes.js";
import { DEFAULT_MATERIAL_UNITS, validateMaterialUnitCatalog } from "../domain/materialUnits.js";

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid number environment value: ${value}`);
  }

  return parsed;
}

function readNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid number environment value: ${value}`);
  }

  return parsed;
}

function readOptionalPositiveNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid number environment value: ${value}`);
  }

  return parsed;
}

function readStringList(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function readOptionalUnitInterval(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    throw new Error(`Invalid confidence environment value: ${value}`);
  }

  return parsed;
}

function readLogLevel(value: string | undefined): "debug" | "info" | "warn" | "error" {
  if (value === undefined || value.trim() === "") {
    return "info";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  throw new Error(`Invalid log level environment value: ${value}`);
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  throw new Error(`Invalid boolean environment value: ${value}`);
}

function readStorageDir(value: string | undefined, fallback: string): string {
  const resolved = path.resolve(value && value.trim() !== "" ? value : fallback);
  const srcRoot = path.resolve("src");
  if (resolved === srcRoot || resolved.startsWith(`${srcRoot}${path.sep}`)) {
    throw new Error("Document storage cannot be inside source-code folders");
  }
  return resolved;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readNumber(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  trustProxy: readBoolean(process.env.TRUST_PROXY, false),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
  authCookieName: process.env.AUTH_COOKIE_NAME ?? "trinetra_session",
  authRateLimitWindowMs: readNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  authRateLimitMax: readNumber(process.env.AUTH_RATE_LIMIT_MAX, 10),
  vehicleRegMinLength: readNumber(process.env.VEHICLE_REG_MIN_LENGTH, 4),
  vehicleRegMaxLength: readNumber(process.env.VEHICLE_REG_MAX_LENGTH, 15),
  weighmentMinKg: readNumber(process.env.WEIGHMENT_MIN_KG, 50),
  weighmentMaxKg: readNumber(process.env.WEIGHMENT_MAX_KG, 120_000),
  weighmentSimulatedKg: readOptionalPositiveNumber(process.env.WEIGHMENT_SIMULATED_KG),
  anprSimulatedPlates: readStringList(process.env.ANPR_SIMULATED_PLATES, [
    "AP39XX1234",
    "MH12AB1234",
    "TS09EA1234",
  ]),
  anprHighConfidenceMin: readOptionalUnitInterval(process.env.ANPR_HIGH_CONFIDENCE_MIN, 0.9),
  anprMediumConfidenceMin: readOptionalUnitInterval(process.env.ANPR_MEDIUM_CONFIDENCE_MIN, 0.7),
  anprFailureAlertThreshold: readNumber(process.env.ANPR_FAILURE_ALERT_THRESHOLD, 3),
  anprEvidenceRetentionDays: readNumber(process.env.ANPR_EVIDENCE_RETENTION_DAYS, 30),
  anprEvidenceStorageDir: readStorageDir(
    process.env.ANPR_EVIDENCE_STORAGE_DIR,
    path.join(process.cwd(), "storage", "anpr-evidence"),
  ),
  gatewayOfflineTimeoutMs: readNumber(process.env.GATEWAY_OFFLINE_TIMEOUT_MS, 45_000),
  edgeIngestMaxBytes: readNumber(process.env.EDGE_INGEST_MAX_BYTES, 12 * 1024 * 1024),
  documentMaxBytes: readNumber(process.env.DOCUMENT_MAX_BYTES, 10 * 1024 * 1024),
  documentStorageDir: readStorageDir(process.env.DOCUMENT_STORAGE_DIR, path.join(process.cwd(), "storage", "documents")),
  documentTypes: validateDocumentTypeCatalog(
    readStringList(process.env.DOCUMENT_TYPES, [...DEFAULT_DOCUMENT_TYPES]),
  ),
  materialUnits: validateMaterialUnitCatalog(
    readStringList(process.env.MATERIAL_UNITS, [...DEFAULT_MATERIAL_UNITS]),
  ),
  materialOcrMinConfidence: readOptionalUnitInterval(process.env.MATERIAL_OCR_MIN_CONFIDENCE, 0.9),
  driverModeEnabled: readBoolean(process.env.DRIVER_MODE_ENABLED, true),
  driverDefaultLanguage: process.env.DRIVER_DEFAULT_LANGUAGE ?? "en",
  driverLanguages: readStringList(process.env.DRIVER_LANGUAGES, ["en", "hi", "te"]),
  driverVoiceEnabled: readBoolean(process.env.DRIVER_VOICE_ENABLED, true),
  driverAudioEnabled: readBoolean(process.env.DRIVER_AUDIO_ENABLED, true),
  backupEnabled: readBoolean(process.env.BACKUP_ENABLED, false),
  backupDirectory: readStorageDir(
    process.env.BACKUP_DIRECTORY,
    path.join(process.cwd(), "storage", "backups"),
  ),
  backupRetentionDays: readNumber(process.env.BACKUP_RETENTION_DAYS, 14),
  backupIntervalMs: readNonNegativeInteger(process.env.BACKUP_INTERVAL_MS, 0),
  reliabilityScanIntervalMs: readNumber(process.env.RELIABILITY_SCAN_INTERVAL_MS, 5 * 60 * 1000),
  staleDocumentPendingHours: readNumber(process.env.STALE_DOCUMENT_PENDING_HOURS, 4),
  stalePendingApprovalHours: readNumber(process.env.STALE_PENDING_APPROVAL_HOURS, 8),
  staleUnloadingHours: readNumber(process.env.STALE_UNLOADING_HOURS, 6),
  staleSecondWeighmentHours: readNumber(process.env.STALE_SECOND_WEIGHMENT_HOURS, 4),
  staleIntermediateHours: readNumber(process.env.STALE_INTERMEDIATE_HOURS, 12),
  gatewayStaleAfterMs: readNumber(process.env.GATEWAY_STALE_AFTER_MS, 20_000),
  simulateDatabaseUnavailable: readBoolean(process.env.SIMULATE_DATABASE_UNAVAILABLE, false),
  simulateEdgeOffline: readBoolean(process.env.SIMULATE_EDGE_OFFLINE, false),
  simulateSyncFailure: readBoolean(process.env.SIMULATE_SYNC_FAILURE, false),
  simulateProviderUnavailable: readBoolean(process.env.SIMULATE_PROVIDER_UNAVAILABLE, false),
  logLevel: readLogLevel(process.env.LOG_LEVEL),
  slowRequestMs: readNumber(process.env.SLOW_REQUEST_MS, 2000),
  slowQueryMs: readNumber(process.env.SLOW_QUERY_MS, 500),
  monitoringApiErrorRate: readOptionalUnitInterval(process.env.MONITORING_API_ERROR_RATE, 0.2),
  monitoringMinSampleSize: readNumber(process.env.MONITORING_MIN_SAMPLE_SIZE, 20),
  monitoringSyncQueueWarn: readNumber(process.env.MONITORING_SYNC_QUEUE_WARN, 100),
  monitoringFailedSyncWarn: readNumber(process.env.MONITORING_FAILED_SYNC_WARN, 10),
  monitoringDbLatencyWarnMs: readNumber(process.env.MONITORING_DB_LATENCY_MS, 500),
  integrationWebhookTimeoutMs: readNumber(process.env.INTEGRATION_WEBHOOK_TIMEOUT_MS, 10_000),
  integrationDeliveryIntervalMs: readNumber(process.env.INTEGRATION_DELIVERY_INTERVAL_MS, 5_000),
};

export function isProduction(): boolean {
  return env.nodeEnv === "production";
}

export function simulationFlags(): {
  databaseUnavailable: boolean;
  edgeOffline: boolean;
  syncFailure: boolean;
  providerUnavailable: boolean;
} {
  if (isProduction()) {
    return {
      databaseUnavailable: false,
      edgeOffline: false,
      syncFailure: false,
      providerUnavailable: false,
    };
  }
  return {
    databaseUnavailable: env.simulateDatabaseUnavailable,
    edgeOffline: env.simulateEdgeOffline,
    syncFailure: env.simulateSyncFailure,
    providerUnavailable: env.simulateProviderUnavailable,
  };
}
