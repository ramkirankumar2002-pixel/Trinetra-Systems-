import type { ConfigCache } from "../store/types.js";

export type OfflineAction =
  | "READ_WEIGHT"
  | "ANPR"
  | "DOCUMENT_CAPTURE"
  | "BASIC_TRANSACTION"
  | "WEIGHT_ANOMALY"
  | "TRANSACTION_COMPLETION"
  | "APPROVAL";

export function isConfigStale(cache: ConfigCache | null, nowMs: number): boolean {
  if (!cache) {
    return true;
  }
  return nowMs > Date.parse(cache.validUntil);
}

export function evaluateLocalAction(
  cache: ConfigCache | null,
  action: OfflineAction,
  context: { nowMs: number; approvalRequired?: boolean },
): { allowed: boolean; reason: string } {
  if (!cache) {
    return { allowed: false, reason: "Configuration refresh required." };
  }
  const stale = isConfigStale(cache, context.nowMs);
  const policy = cache.policy;
  switch (action) {
    case "READ_WEIGHT":
      return policy.allowWeightRead
        ? { allowed: true, reason: "Allowed." }
        : { allowed: false, reason: "Weight reading is disabled by offline policy." };
    case "ANPR":
      return policy.allowAnpr
        ? { allowed: true, reason: "Allowed." }
        : { allowed: false, reason: "ANPR capture is disabled by offline policy." };
    case "DOCUMENT_CAPTURE":
      return policy.allowDocumentCapture
        ? { allowed: true, reason: "Allowed." }
        : { allowed: false, reason: "Document capture is disabled by offline policy." };
    case "BASIC_TRANSACTION":
      if (stale) {
        return { allowed: false, reason: "Configuration refresh required." };
      }
      return policy.allowBasicTransactionRecording
        ? { allowed: true, reason: "Allowed." }
        : { allowed: false, reason: "Local transaction recording is disabled by offline policy." };
    case "WEIGHT_ANOMALY":
      if (stale) {
        return { allowed: false, reason: "Configuration refresh required." };
      }
      return policy.allowWeightAnomalyDetection
        ? { allowed: true, reason: "Allowed." }
        : { allowed: false, reason: "Local weight anomaly detection is disabled by offline policy." };
    case "TRANSACTION_COMPLETION":
      if (stale) {
        return { allowed: false, reason: "Configuration refresh required." };
      }
      if (policy.transactionCompletion === "BLOCKED") {
        return { allowed: false, reason: "Offline completion is blocked by policy." };
      }
      if (policy.transactionCompletion === "CONDITIONAL" && context.approvalRequired) {
        return {
          allowed: false,
          reason: "Approval required. The visit is paused until central authorization is available.",
        };
      }
      return { allowed: true, reason: "Conditional offline completion is permitted." };
    case "APPROVAL":
      return { allowed: false, reason: "Approvals cannot be granted offline." };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function lookupCachedVehicle(cache: ConfigCache | null, plate: string) {
  if (!cache) {
    return null;
  }
  const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (
    cache.vehicles.find(
      (vehicle) =>
        vehicle.normalizedPlateNumber === normalized || vehicle.registrationNumber === normalized,
    ) ?? null
  );
}
