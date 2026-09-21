import type { NotificationSeverity } from "../notificationCatalog.js";
import type { WeightQuality } from "../weightQuality.js";

export const WEIGHT_ANOMALY_TYPES = [
  "EMPTY_PLATFORM_WEIGHT",
  "SUDDEN_WEIGHT_CHANGE",
  "REPEATED_INSTABILITY",
  "WEIGHT_JUMP",
  "NEGATIVE_OR_INVALID_WEIGHT",
] as const;

export type WeightAnomalyType = (typeof WEIGHT_ANOMALY_TYPES)[number];

export const WEIGHT_ANOMALY_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"] as const;
export type WeightAnomalyStatus = (typeof WEIGHT_ANOMALY_STATUSES)[number];

export const WEIGHBRIDGE_PLATFORM_STATES = [
  "EMPTY",
  "VEHICLE_PRESENT",
  "WEIGHING",
  "UNLOADING",
  "WAITING_FOR_TARE",
  "MAINTENANCE",
  "UNKNOWN",
] as const;

export type WeighbridgePlatformState = (typeof WEIGHBRIDGE_PLATFORM_STATES)[number];

export const WEIGHT_ANOMALY_DETECTOR_KINDS = ["RULE", "STATISTICAL", "ML"] as const;
export type WeightAnomalyDetectorKind = (typeof WEIGHT_ANOMALY_DETECTOR_KINDS)[number];

export type WeightAnomalySeverity = Extract<NotificationSeverity, "INFO" | "WARNING" | "ERROR" | "CRITICAL">;

export type WeightAnomalyConfigValues = {
  emptyPlatformThresholdKg: number;
  maxChangePerSecondKg: number;
  weightJumpThresholdKg: number;
  maxInstabilityDurationMs: number;
  minAnomalyDurationMs: number;
  consecutiveAnomalyCount: number;
  cooldownMs: number;
  suddenChangeWindowMs: number;
  suppressAlertsInMaintenance: boolean;
};

export type AnomalySample = {
  timestampMs: number;
  weightKg: number | null;
  quality: WeightQuality;
  unit: string;
  valid: boolean;
};

export type DetectorHit = {
  type: WeightAnomalyType;
  severity: WeightAnomalySeverity;
  ruleId: string;
  ruleVersion: string;
  title: string;
  description: string;
  explanation: string;
  observedWeightKg: number | null;
  previousWeightKg: number | null;
  expectedMinKg: number | null;
  expectedMaxKg: number | null;
  confirmedImmediately: boolean;
};

export type DetectorContext = {
  current: AnomalySample;
  previous: AnomalySample | null;
  window: AnomalySample[];
  platformState: WeighbridgePlatformState;
  config: WeightAnomalyConfigValues;
  unstableDurationMs: number;
  consecutiveUnstable: number;
};

export type WeightAnomalyDetector = {
  id: string;
  version: string;
  type: WeightAnomalyType;
  kind: WeightAnomalyDetectorKind;
  evaluate: (context: DetectorContext) => DetectorHit | null;
};

export type CandidateState = {
  firstMs: number;
  count: number;
};

export type EngineEvaluation = {
  hits: DetectorHit[];
  confirmedHits: DetectorHit[];
  recoveredTypes: WeightAnomalyType[];
  window: AnomalySample[];
  candidates: Map<WeightAnomalyType, CandidateState>;
};

export function isWeightAnomalyType(value: string): value is WeightAnomalyType {
  return (WEIGHT_ANOMALY_TYPES as readonly string[]).includes(value);
}

export function isWeightAnomalyStatus(value: string): value is WeightAnomalyStatus {
  return (WEIGHT_ANOMALY_STATUSES as readonly string[]).includes(value);
}

export function isWeighbridgePlatformState(value: string): value is WeighbridgePlatformState {
  return (WEIGHBRIDGE_PLATFORM_STATES as readonly string[]).includes(value);
}

export function isWeightAnomalySeverity(value: string): value is WeightAnomalySeverity {
  return value === "INFO" || value === "WARNING" || value === "ERROR" || value === "CRITICAL";
}
