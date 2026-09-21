import type { WeightAnomalyConfigValues } from "./types.js";

export const WEIGHT_ANOMALY_RULE_VERSION = "1.0.0";
export const DEVELOPMENT_DEFAULT_LABEL = "DEVELOPMENT DEFAULT";

/** DEVELOPMENT DEFAULT — validate against the installed weighbridge before production use. */
export const DEVELOPMENT_DEFAULT_ANOMALY_CONFIG: WeightAnomalyConfigValues = {
  emptyPlatformThresholdKg: 50,
  maxChangePerSecondKg: 2000,
  weightJumpThresholdKg: 3000,
  maxInstabilityDurationMs: 8000,
  minAnomalyDurationMs: 800,
  consecutiveAnomalyCount: 2,
  cooldownMs: 120_000,
  suddenChangeWindowMs: 3000,
  suppressAlertsInMaintenance: true,
};

export const MAX_ANOMALY_WINDOW = 32;
export const MAX_ANOMALY_OBSERVATIONS = 40;
export const PERSIST_OBSERVATION_INTERVAL_MS = 5000;
export const CONTEXT_CACHE_MS = 2000;
export const CONFIG_CACHE_MS = 5000;

export function parseConfigNumber(value: { toString(): string } | number | string): number {
  return typeof value === "number" ? value : Number(value.toString());
}

export function toConfigValues(row: {
  emptyPlatformThresholdKg: { toString(): string };
  maxChangePerSecondKg: { toString(): string };
  weightJumpThresholdKg: { toString(): string };
  maxInstabilityDurationMs: number;
  minAnomalyDurationMs: number;
  consecutiveAnomalyCount: number;
  cooldownMs: number;
  suddenChangeWindowMs: number;
  suppressAlertsInMaintenance: boolean;
}): WeightAnomalyConfigValues {
  return {
    emptyPlatformThresholdKg: parseConfigNumber(row.emptyPlatformThresholdKg),
    maxChangePerSecondKg: parseConfigNumber(row.maxChangePerSecondKg),
    weightJumpThresholdKg: parseConfigNumber(row.weightJumpThresholdKg),
    maxInstabilityDurationMs: row.maxInstabilityDurationMs,
    minAnomalyDurationMs: row.minAnomalyDurationMs,
    consecutiveAnomalyCount: row.consecutiveAnomalyCount,
    cooldownMs: row.cooldownMs,
    suddenChangeWindowMs: row.suddenChangeWindowMs,
    suppressAlertsInMaintenance: row.suppressAlertsInMaintenance,
  };
}
