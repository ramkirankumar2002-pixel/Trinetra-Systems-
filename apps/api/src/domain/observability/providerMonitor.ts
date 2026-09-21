import { classifyDependencyHealth } from "../reliability/health.js";
import type { DependencyHealthStatus } from "../reliability/types.js";

export const PROVIDER_MONITOR_STATUSES = [
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
  "SIMULATION",
  "DISABLED",
] as const;
export type ProviderMonitorStatus = (typeof PROVIDER_MONITOR_STATUSES)[number];

export function classifyProviderMonitorStatus(input: {
  configured: boolean;
  reachable: boolean;
  simulation: boolean;
  disabled?: boolean;
  degraded?: boolean;
}): ProviderMonitorStatus {
  return classifyDependencyHealth({
    name: "provider",
    configured: input.configured,
    reachable: input.reachable,
    simulation: input.simulation,
    ...(input.disabled === undefined ? {} : { disabled: input.disabled }),
    ...(input.degraded === undefined ? {} : { degraded: input.degraded }),
  });
}

export function isSimulatedProviderStatus(status: DependencyHealthStatus): boolean {
  return status === "SIMULATION";
}
