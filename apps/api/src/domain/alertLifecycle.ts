import type { OperationalAlertStatus } from "./notificationCatalog.js";

export function canAcknowledgeAlert(status: OperationalAlertStatus): { ok: true } | { ok: false; error: string } {
  if (status === "OPEN") {
    return { ok: true };
  }
  if (status === "ACKNOWLEDGED") {
    return { ok: false, error: "This alert is already acknowledged" };
  }
  return { ok: false, error: "A resolved alert cannot be acknowledged" };
}

export function canResolveAlert(status: OperationalAlertStatus): { ok: true } | { ok: false; error: string } {
  if (status === "RESOLVED") {
    return { ok: false, error: "This alert is already resolved" };
  }
  return { ok: true };
}

export function nextAlertStatus(
  current: OperationalAlertStatus,
  action: "ACKNOWLEDGE" | "RESOLVE",
): OperationalAlertStatus | null {
  if (action === "ACKNOWLEDGE") {
    return canAcknowledgeAlert(current).ok ? "ACKNOWLEDGED" : null;
  }
  return canResolveAlert(current).ok ? "RESOLVED" : null;
}
