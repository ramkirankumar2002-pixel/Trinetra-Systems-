import type { HardwareDeviceStatus } from "@prisma/client";

export const COMMUNICATION_STATES = ["ONLINE", "DEGRADED", "OFFLINE", "ERROR", "DISABLED"] as const;
export type CommunicationState = (typeof COMMUNICATION_STATES)[number];

export function communicationFromHardwareStatus(
  status: HardwareDeviceStatus,
  enabled: boolean,
): CommunicationState {
  if (!enabled || status === "DISABLED") {
    return "DISABLED";
  }
  switch (status) {
    case "CONNECTED":
      return "ONLINE";
    case "CONNECTING":
      return "DEGRADED";
    case "DISCONNECTED":
      return "OFFLINE";
    case "ERROR":
      return "ERROR";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
