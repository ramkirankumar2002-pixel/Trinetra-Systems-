export const CAMERA_DEVICE_STATUSES = ["CONNECTED", "DISCONNECTED", "CONNECTING", "ERROR", "DISABLED"] as const;
export type CameraDeviceStatus = (typeof CAMERA_DEVICE_STATUSES)[number];

export type CameraHealthSnapshot = {
  healthy: boolean;
  lastCommunicationAt: string | null;
  lastFrameAt: string | null;
  lastError: string | null;
};

export function deriveCameraHealth(input: {
  enabled: boolean;
  status: CameraDeviceStatus;
  lastCommunicationAt: Date | string | null;
  lastFrameAt: Date | string | null;
  lastError: string | null;
  healthTimeoutMs: number;
  now?: Date;
}): CameraHealthSnapshot {
  const now = input.now ?? new Date();
  const lastCommunicationAt =
    input.lastCommunicationAt === null
      ? null
      : typeof input.lastCommunicationAt === "string"
        ? input.lastCommunicationAt
        : input.lastCommunicationAt.toISOString();
  const lastFrameAt =
    input.lastFrameAt === null
      ? null
      : typeof input.lastFrameAt === "string"
        ? input.lastFrameAt
        : input.lastFrameAt.toISOString();

  if (!input.enabled || input.status === "DISABLED") {
    return {
      healthy: false,
      lastCommunicationAt,
      lastFrameAt,
      lastError: input.lastError,
    };
  }

  if (input.status === "ERROR" || input.status === "DISCONNECTED" || input.status === "CONNECTING") {
    return {
      healthy: false,
      lastCommunicationAt,
      lastFrameAt,
      lastError: input.lastError,
    };
  }

  if (lastCommunicationAt === null) {
    return {
      healthy: false,
      lastCommunicationAt,
      lastFrameAt,
      lastError: input.lastError ?? "No camera communication yet",
    };
  }

  const age = now.getTime() - new Date(lastCommunicationAt).getTime();
  if (age > input.healthTimeoutMs) {
    return {
      healthy: false,
      lastCommunicationAt,
      lastFrameAt,
      lastError: input.lastError ?? "Camera communication timed out",
    };
  }

  return {
    healthy: true,
    lastCommunicationAt,
    lastFrameAt,
    lastError: input.lastError,
  };
}
