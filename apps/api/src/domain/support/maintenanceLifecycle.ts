import { HttpError } from "../../lib/httpError.js";
import type { ServiceMaintenanceStatus } from "./catalog.js";

const TRANSITIONS: Record<ServiceMaintenanceStatus, ServiceMaintenanceStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionMaintenance(
  from: ServiceMaintenanceStatus,
  to: ServiceMaintenanceStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertMaintenanceTransition(
  from: ServiceMaintenanceStatus,
  to: ServiceMaintenanceStatus,
): void {
  if (from === to) {
    return;
  }
  if (!canTransitionMaintenance(from, to)) {
    throw new HttpError(409, `Cannot change maintenance status from ${from} to ${to}`);
  }
}

export function isActiveMaintenanceStatus(status: ServiceMaintenanceStatus): boolean {
  return status === "SCHEDULED" || status === "IN_PROGRESS";
}
