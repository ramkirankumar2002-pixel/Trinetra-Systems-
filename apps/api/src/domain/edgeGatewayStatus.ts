import type { EdgeGatewayStatusValue } from "./edgeTypes.js";

export function deriveGatewayRuntimeStatus(input: {
  enabled: boolean;
  revokedAt: Date | null;
  lastHeartbeatAt: Date | null;
  nowMs: number;
  offlineTimeoutMs: number;
}): EdgeGatewayStatusValue {
  if (input.revokedAt !== null) {
    return "REVOKED";
  }
  if (!input.enabled) {
    return "DISABLED";
  }
  if (input.lastHeartbeatAt === null) {
    return "PENDING";
  }
  if (input.nowMs - input.lastHeartbeatAt.getTime() > input.offlineTimeoutMs) {
    return "OFFLINE";
  }
  return "ONLINE";
}

export function isGatewayAcceptingEvents(status: EdgeGatewayStatusValue): boolean {
  return status === "ONLINE" || status === "PENDING" || status === "OFFLINE";
}
