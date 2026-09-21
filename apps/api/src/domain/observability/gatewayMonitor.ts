import type { EdgeGatewayStatusValue } from "../edgeTypes.js";
import type { GatewayLivenessStatus } from "../reliability/types.js";

export const MONITOR_GATEWAY_STATUSES = ["ONLINE", "DEGRADED", "STALE", "OFFLINE", "ERROR"] as const;
export type MonitorGatewayStatus = (typeof MONITOR_GATEWAY_STATUSES)[number];

export function overlayGatewayMonitorStatus(input: {
  runtime: EdgeGatewayStatusValue;
  liveness: GatewayLivenessStatus | "DISABLED";
  lastError: string | null;
  unhealthyDeviceCount: number;
}): MonitorGatewayStatus {
  if (input.runtime === "REVOKED") {
    return "ERROR";
  }
  if (input.runtime === "DISABLED" || input.liveness === "DISABLED") {
    return "OFFLINE";
  }
  if (input.runtime === "OFFLINE" || input.runtime === "PENDING" || input.liveness === "OFFLINE") {
    return "OFFLINE";
  }
  if (input.liveness === "STALE") {
    return "STALE";
  }
  if (input.lastError !== null || input.unhealthyDeviceCount > 0) {
    return "DEGRADED";
  }
  return "ONLINE";
}
