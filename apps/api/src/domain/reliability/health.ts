import type { DependencyHealthStatus } from "./types.js";

export type DependencyCheckInput = {
  name: string;
  configured: boolean;
  reachable: boolean;
  degraded?: boolean;
  simulation?: boolean;
  disabled?: boolean;
};

export function classifyDependencyHealth(input: DependencyCheckInput): DependencyHealthStatus {
  if (input.disabled) {
    return "DISABLED";
  }
  if (!input.configured) {
    return "DISABLED";
  }
  if (input.simulation && input.reachable) {
    return "SIMULATION";
  }
  if (!input.reachable) {
    return "UNAVAILABLE";
  }
  if (input.degraded) {
    return "DEGRADED";
  }
  return "AVAILABLE";
}

export function overallReadiness(
  checks: Record<string, DependencyHealthStatus>,
): "ready" | "degraded" | "unavailable" {
  const values = Object.values(checks);
  if (values.includes("UNAVAILABLE")) {
    return "unavailable";
  }
  if (values.includes("DEGRADED")) {
    return "degraded";
  }
  return "ready";
}

export function applySimulationOverride(
  status: DependencyHealthStatus,
  simulateUnavailable: boolean,
): DependencyHealthStatus {
  if (simulateUnavailable) {
    return "UNAVAILABLE";
  }
  return status;
}
