import type { HardwareProtocolReadinessValue } from "./protocolReadiness.js";

export const HARDWARE_INSTALLATION_STATUSES = [
  "PLANNED",
  "CONFIGURED",
  "CONNECTED",
  "TESTING",
  "PILOT",
  "PRODUCTION",
  "DISABLED",
] as const;
export type HardwareInstallationStatusValue = (typeof HARDWARE_INSTALLATION_STATUSES)[number];

export function isHardwareInstallationStatus(value: string): value is HardwareInstallationStatusValue {
  return (HARDWARE_INSTALLATION_STATUSES as readonly string[]).includes(value);
}

export function installationStatusRejection(
  status: HardwareInstallationStatusValue,
  readiness: HardwareProtocolReadinessValue,
): string | null {
  if (status === "PRODUCTION" && readiness !== "DOCUMENTED") {
    return "Production installation requires a documented manufacturer protocol";
  }
  return null;
}
