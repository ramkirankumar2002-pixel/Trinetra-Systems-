import type {
  NotificationSeverity,
  WeightAnomalyStatus,
  WeightAnomalyTimelineKind,
  WeightAnomalyType,
  WeighbridgePlatformState,
} from "@prisma/client";

export type PublicWeightAnomaly = {
  id: string;
  weighbridge: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  deviceId: string | null;
  transactionId: string | null;
  transactionReference: string | null;
  type: WeightAnomalyType;
  status: WeightAnomalyStatus;
  severity: NotificationSeverity;
  ruleId: string;
  ruleVersion: string;
  title: string;
  description: string;
  explanation: string;
  observedWeightKg: string | null;
  previousWeightKg: string | null;
  expectedMinKg: string | null;
  expectedMaxKg: string | null;
  platformState: WeighbridgePlatformState;
  detectionSource: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  durationMs: number | null;
  minObservedKg: string | null;
  maxObservedKg: string | null;
  averageObservedKg: string | null;
  recoveredAt: string | null;
  recoveredDurationMs: number | null;
  suppressedDueToMaintenance: boolean;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  reviewReason: string | null;
};

export type PublicAnomalyObservation = {
  id: string;
  recordedAt: string;
  kind: WeightAnomalyTimelineKind;
  weightKg: string | null;
  quality: string | null;
  platformState: string | null;
  note: string | null;
};

export type PublicAnomalyConfig = {
  weighbridgeId: string;
  emptyPlatformThresholdKg: string;
  maxChangePerSecondKg: string;
  weightJumpThresholdKg: string;
  maxInstabilityDurationMs: number;
  minAnomalyDurationMs: number;
  consecutiveAnomalyCount: number;
  cooldownMs: number;
  suddenChangeWindowMs: number;
  suppressAlertsInMaintenance: boolean;
  defaultsLabel: string;
  updatedAt: string;
};

export type PublicWeightHealth = {
  weighbridgeId: string;
  weighbridgeCode: string;
  currentWeightKg: string | null;
  quality: string | null;
  platformState: WeighbridgePlatformState;
  healthStatus: "NORMAL" | "ANOMALY" | "MAINTENANCE";
  lastValidWeightKg: string | null;
  lastNormalWeightKg: string | null;
  lastAnomaly: PublicWeightAnomaly | null;
  openAnomalyCount: number;
  deviceStatus: string | null;
  lastReadingAt: string | null;
};

type EventRow = {
  id: string;
  deviceId: string | null;
  transactionId: string | null;
  type: WeightAnomalyType;
  status: WeightAnomalyStatus;
  severity: NotificationSeverity;
  ruleId: string;
  ruleVersion: string;
  title: string;
  description: string;
  explanation: string;
  observedWeightKg: { toString(): string } | null;
  previousWeightKg: { toString(): string } | null;
  expectedMinKg: { toString(): string } | null;
  expectedMaxKg: { toString(): string } | null;
  platformState: WeighbridgePlatformState;
  detectionSource: string;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  occurrenceCount: number;
  durationMs: number | null;
  minObservedKg: { toString(): string } | null;
  maxObservedKg: { toString(): string } | null;
  sumObservedKg: { toString(): string } | null;
  recoveredAt: Date | null;
  recoveredDurationMs: number | null;
  suppressedDueToMaintenance: boolean;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  reviewReason: string | null;
  weighbridge: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  transaction: { referenceNumber: string } | null;
};

export function toPublicWeightAnomaly(row: EventRow): PublicWeightAnomaly {
  const average =
    row.sumObservedKg && row.occurrenceCount > 0
      ? (Number(row.sumObservedKg.toString()) / row.occurrenceCount).toFixed(3)
      : null;
  return {
    id: row.id,
    weighbridge: row.weighbridge,
    site: row.site,
    deviceId: row.deviceId,
    transactionId: row.transactionId,
    transactionReference: row.transaction?.referenceNumber ?? null,
    type: row.type,
    status: row.status,
    severity: row.severity,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    title: row.title,
    description: row.description,
    explanation: row.explanation,
    observedWeightKg: row.observedWeightKg?.toString() ?? null,
    previousWeightKg: row.previousWeightKg?.toString() ?? null,
    expectedMinKg: row.expectedMinKg?.toString() ?? null,
    expectedMaxKg: row.expectedMaxKg?.toString() ?? null,
    platformState: row.platformState,
    detectionSource: row.detectionSource,
    firstDetectedAt: row.firstDetectedAt.toISOString(),
    lastDetectedAt: row.lastDetectedAt.toISOString(),
    occurrenceCount: row.occurrenceCount,
    durationMs: row.durationMs,
    minObservedKg: row.minObservedKg?.toString() ?? null,
    maxObservedKg: row.maxObservedKg?.toString() ?? null,
    averageObservedKg: average,
    recoveredAt: row.recoveredAt?.toISOString() ?? null,
    recoveredDurationMs: row.recoveredDurationMs,
    suppressedDueToMaintenance: row.suppressedDueToMaintenance,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    reviewReason: row.reviewReason,
  };
}

export function toPublicObservation(row: {
  id: string;
  recordedAt: Date;
  kind: WeightAnomalyTimelineKind;
  weightKg: { toString(): string } | null;
  quality: string | null;
  platformState: string | null;
  note: string | null;
}): PublicAnomalyObservation {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    kind: row.kind,
    weightKg: row.weightKg?.toString() ?? null,
    quality: row.quality,
    platformState: row.platformState,
    note: row.note,
  };
}

export function toPublicAnomalyConfig(row: {
  weighbridgeId: string;
  emptyPlatformThresholdKg: { toString(): string };
  maxChangePerSecondKg: { toString(): string };
  weightJumpThresholdKg: { toString(): string };
  maxInstabilityDurationMs: number;
  minAnomalyDurationMs: number;
  consecutiveAnomalyCount: number;
  cooldownMs: number;
  suddenChangeWindowMs: number;
  suppressAlertsInMaintenance: boolean;
  defaultsLabel: string;
  updatedAt: Date;
}): PublicAnomalyConfig {
  return {
    weighbridgeId: row.weighbridgeId,
    emptyPlatformThresholdKg: row.emptyPlatformThresholdKg.toString(),
    maxChangePerSecondKg: row.maxChangePerSecondKg.toString(),
    weightJumpThresholdKg: row.weightJumpThresholdKg.toString(),
    maxInstabilityDurationMs: row.maxInstabilityDurationMs,
    minAnomalyDurationMs: row.minAnomalyDurationMs,
    consecutiveAnomalyCount: row.consecutiveAnomalyCount,
    cooldownMs: row.cooldownMs,
    suddenChangeWindowMs: row.suddenChangeWindowMs,
    suppressAlertsInMaintenance: row.suppressAlertsInMaintenance,
    defaultsLabel: row.defaultsLabel,
    updatedAt: row.updatedAt.toISOString(),
  };
}
