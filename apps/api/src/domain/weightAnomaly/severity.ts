import type { SecuritySeverity } from "@prisma/client";
import type { WeightAnomalySeverity } from "./types.js";

export function toSecuritySeverity(severity: WeightAnomalySeverity): SecuritySeverity {
  switch (severity) {
    case "INFO":
    case "WARNING":
      return "ANOMALY";
    case "ERROR":
      return "SUSPICIOUS_EVENT";
    case "CRITICAL":
      return "HIGH_RISK_EVENT";
    default: {
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

export function formatKgValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value} kg`;
}
