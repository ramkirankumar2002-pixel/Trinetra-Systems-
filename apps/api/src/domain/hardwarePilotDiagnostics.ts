import { stripSecretFields } from "./edgeSecrets.js";

export type PublicWeightDiagnostic = {
  connectionStatus: string;
  raw: string | null;
  parsedWeightKg: number | string | null;
  stable: boolean | string | null;
  timestamp: string | null;
  parserStatus: string | null;
  lastError: string | null;
  testKind: "SIMULATED" | "PROTOCOL_TEST" | "REAL_HARDWARE" | "UNAVAILABLE";
};

export function toPublicWeightDiagnostic(value: unknown): PublicWeightDiagnostic | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = stripSecretFields(value) as Record<string, unknown>;
  const testKind = asTestKind(record.testKind);
  return {
    connectionStatus: asText(record.connectionStatus) ?? asText(record.status) ?? (typeof record.weightKg !== "undefined" ? "CONNECTED" : "UNKNOWN"),
    raw: asText(record.raw),
    parsedWeightKg:
      typeof record.parsedWeightKg === "number"
        ? record.parsedWeightKg
        : typeof record.weightKg === "number" || typeof record.weightKg === "string"
          ? record.weightKg
          : null,
    stable:
      typeof record.stable === "boolean"
        ? record.stable
        : typeof record.quality === "string"
          ? record.quality === "STABLE"
          : null,
    timestamp: asText(record.timestamp) ?? asText(record.capturedAt),
    parserStatus: asText(record.parserStatus),
    lastError: asText(record.lastError),
    testKind,
  };
}

function asTestKind(value: unknown): PublicWeightDiagnostic["testKind"] {
  if (value === "PROTOCOL_TEST" || value === "REAL_HARDWARE" || value === "SIMULATED" || value === "UNAVAILABLE") {
    return value;
  }
  return "SIMULATED";
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
