import type { DashboardExceptionType } from "../dashboardScope.js";

export const EXCEPTION_FAMILIES = [
  "WEIGHT_EXCEPTION",
  "WORKFLOW_EXCEPTION",
  "DOCUMENT_EXCEPTION",
  "PROVIDER_EXCEPTION",
  "SYNCHRONIZATION_EXCEPTION",
] as const;

export type ExceptionFamily = (typeof EXCEPTION_FAMILIES)[number];

export function isExceptionFamily(value: string): value is ExceptionFamily {
  return (EXCEPTION_FAMILIES as readonly string[]).includes(value);
}

export function familyFromDashboardType(type: DashboardExceptionType): ExceptionFamily {
  switch (type) {
    case "WEIGHT_VALIDATION":
    case "TARE_EXCEEDS_GROSS":
      return "WEIGHT_EXCEPTION";
    case "MISSING_DOCUMENT":
    case "DOCUMENT_VERIFICATION":
      return "DOCUMENT_EXCEPTION";
    case "APPROVAL_REJECTED":
    case "WORKFLOW":
    case "MISSING_UNLOADING":
    case "TRANSACTION_EXCEPTION":
      return "WORKFLOW_EXCEPTION";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export const PROVIDER_ALERT_TYPES = ["SYSTEM_ALERT", "GATEWAY_OFFLINE"] as const;
export const SYNC_ALERT_TYPES = ["SYNC_FAILURE"] as const;
