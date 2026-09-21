export const HARDWARE_DEVICE_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "CONNECTING",
  "ERROR",
  "DISABLED",
] as const;

export type HardwareDeviceStatus = (typeof HARDWARE_DEVICE_STATUSES)[number];

export function isHardwareDeviceStatus(value: string): value is HardwareDeviceStatus {
  return (HARDWARE_DEVICE_STATUSES as readonly string[]).includes(value);
}

export function isDeviceConnected(status: HardwareDeviceStatus): boolean {
  return status === "CONNECTED";
}

export type DeviceHealthSnapshot = {
  status: HardwareDeviceStatus;
  healthy: boolean;
  lastSuccessfulReadingAt: string | null;
  lastCommunicationAt: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
};

export function deriveDeviceHealth(input: {
  enabled: boolean;
  status: HardwareDeviceStatus;
  lastCommunicationAt: Date | null;
  lastSuccessfulReadingAt: Date | null;
  lastError: string | null;
  now: Date;
  healthTimeoutMs: number;
}): DeviceHealthSnapshot {
  const stale =
    input.lastCommunicationAt === null ||
    input.now.getTime() - input.lastCommunicationAt.getTime() > input.healthTimeoutMs;
  const healthy =
    input.enabled &&
    input.status === "CONNECTED" &&
    input.lastSuccessfulReadingAt !== null &&
    !stale &&
    input.lastError === null;

  return {
    status: input.status,
    healthy,
    lastSuccessfulReadingAt: input.lastSuccessfulReadingAt?.toISOString() ?? null,
    lastCommunicationAt: input.lastCommunicationAt?.toISOString() ?? null,
    lastConnectedAt: null,
    lastError: input.lastError,
  };
}
