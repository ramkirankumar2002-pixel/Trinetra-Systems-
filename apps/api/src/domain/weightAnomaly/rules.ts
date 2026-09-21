import { WEIGHT_ANOMALY_RULE_VERSION } from "./config.js";
import { platformAllowsEmptyRule, platformExpectsMotion } from "./platformState.js";
import type { DetectorContext, DetectorHit, WeightAnomalyDetector } from "./types.js";

function hit(
  type: DetectorHit["type"],
  ruleId: string,
  severity: DetectorHit["severity"],
  context: DetectorContext,
  fields: {
    title: string;
    description: string;
    explanation: string;
    expectedMinKg?: number | null;
    expectedMaxKg?: number | null;
    confirmedImmediately?: boolean;
  },
): DetectorHit {
  return {
    type,
    severity,
    ruleId,
    ruleVersion: WEIGHT_ANOMALY_RULE_VERSION,
    title: fields.title,
    description: fields.description,
    explanation: fields.explanation,
    observedWeightKg: context.current.weightKg,
    previousWeightKg: context.previous?.weightKg ?? null,
    expectedMinKg: fields.expectedMinKg ?? null,
    expectedMaxKg: fields.expectedMaxKg ?? null,
    confirmedImmediately: fields.confirmedImmediately === true,
  };
}

function deltaSeconds(currentMs: number, previousMs: number): number {
  return Math.max((currentMs - previousMs) / 1000, 0.2);
}

export const emptyPlatformDetector: WeightAnomalyDetector = {
  id: "rule.empty_platform_weight",
  version: WEIGHT_ANOMALY_RULE_VERSION,
  type: "EMPTY_PLATFORM_WEIGHT",
  kind: "RULE",
  evaluate(context) {
    if (!platformAllowsEmptyRule(context.platformState)) {
      return null;
    }
    const weight = context.current.weightKg;
    if (weight === null || !context.current.valid) {
      return null;
    }
    if (weight <= context.config.emptyPlatformThresholdKg) {
      return null;
    }

    const severity =
      weight >= 2000 ? "CRITICAL" : weight >= 200 ? "ERROR" : "WARNING";
    return hit("EMPTY_PLATFORM_WEIGHT", this.id, severity, context, {
      title: "Weight Anomaly Detected",
      description: "Unexpected non-zero weight while the platform is EMPTY. Inspection is required.",
      explanation: `Weight increased to ${weight} kg while platform state was EMPTY. Expected near zero (threshold ${context.config.emptyPlatformThresholdKg} kg).`,
      expectedMinKg: 0,
      expectedMaxKg: context.config.emptyPlatformThresholdKg,
    });
  },
};

export const weightJumpDetector: WeightAnomalyDetector = {
  id: "rule.weight_jump",
  version: WEIGHT_ANOMALY_RULE_VERSION,
  type: "WEIGHT_JUMP",
  kind: "RULE",
  evaluate(context) {
    const current = context.current.weightKg;
    const previous = context.previous?.weightKg ?? null;
    if (current === null || previous === null || !context.current.valid || context.previous?.valid !== true) {
      return null;
    }
    const change = Math.abs(current - previous);
    if (change < context.config.weightJumpThresholdKg) {
      return null;
    }
    const severity = change >= context.config.weightJumpThresholdKg * 2 ? "CRITICAL" : "ERROR";
    return hit("WEIGHT_JUMP", this.id, severity, context, {
      title: "Suspicious Weight Event",
      description: "An unusually large change occurred between consecutive valid readings.",
      explanation: `Weight changed from ${previous} kg to ${current} kg (${change} kg) between consecutive readings. Jump threshold is ${context.config.weightJumpThresholdKg} kg.`,
      confirmedImmediately: true,
    });
  },
};

export const suddenWeightChangeDetector: WeightAnomalyDetector = {
  id: "rule.sudden_weight_change",
  version: WEIGHT_ANOMALY_RULE_VERSION,
  type: "SUDDEN_WEIGHT_CHANGE",
  kind: "RULE",
  evaluate(context) {
    const current = context.current.weightKg;
    const previous = context.previous;
    if (current === null || previous?.weightKg === null || previous === null || !context.current.valid || !previous.valid) {
      return null;
    }
    const dt = deltaSeconds(context.current.timestampMs, previous.timestampMs);
    if (dt * 1000 > context.config.suddenChangeWindowMs * 2) {
      return null;
    }
    const rate = Math.abs(current - previous.weightKg) / dt;
    if (rate < context.config.maxChangePerSecondKg) {
      return null;
    }
    if (platformExpectsMotion(context.platformState) && previous.quality !== "STABLE") {
      return null;
    }
    return hit("SUDDEN_WEIGHT_CHANGE", this.id, rate >= context.config.maxChangePerSecondKg * 2 ? "ERROR" : "WARNING", context, {
      title: "Measurement Anomaly",
      description: "Weight changed faster than the configured rate while the platform was expected to be stable.",
      explanation: `Weight changed from ${previous.weightKg} kg to ${current} kg within ${dt.toFixed(1)} seconds (${rate.toFixed(0)} kg/s) while platform state was ${context.platformState}. Maximum configured rate is ${context.config.maxChangePerSecondKg} kg/s.`,
    });
  },
};

export const repeatedInstabilityDetector: WeightAnomalyDetector = {
  id: "rule.repeated_instability",
  version: WEIGHT_ANOMALY_RULE_VERSION,
  type: "REPEATED_INSTABILITY",
  kind: "RULE",
  evaluate(context) {
    if (context.current.quality !== "UNSTABLE") {
      return null;
    }
    if (
      context.unstableDurationMs < context.config.maxInstabilityDurationMs &&
      context.consecutiveUnstable < Math.max(context.config.consecutiveAnomalyCount, 3)
    ) {
      return null;
    }
    const severity =
      context.unstableDurationMs >= context.config.maxInstabilityDurationMs * 3 ? "ERROR" : "WARNING";
    return hit("REPEATED_INSTABILITY", this.id, severity, context, {
      title: "Weight Stability Anomaly",
      description: "Unstable readings continued beyond the configured duration. This is not a fraud finding.",
      explanation: `UNSTABLE readings continued for ${context.unstableDurationMs} ms (${context.consecutiveUnstable} consecutive). Maximum configured instability is ${context.config.maxInstabilityDurationMs} ms.`,
      confirmedImmediately: true,
    });
  },
};

export const invalidWeightDetector: WeightAnomalyDetector = {
  id: "rule.negative_or_invalid_weight",
  version: WEIGHT_ANOMALY_RULE_VERSION,
  type: "NEGATIVE_OR_INVALID_WEIGHT",
  kind: "RULE",
  evaluate(context) {
    const weight = context.current.weightKg;
    const quality = context.current.quality;
    const unitOk = context.current.unit === "KG" || context.current.unit === "TONNE";
    const negative = weight !== null && weight < 0;
    const invalidQuality = quality === "INVALID" || quality === "DEVICE_ERROR";
    const corrupt = weight !== null && !Number.isFinite(weight);
    if (!negative && !invalidQuality && unitOk && !corrupt) {
      return null;
    }
    const reason = negative
      ? `Negative weight ${weight} kg is not expected.`
      : !unitOk
        ? `Unit "${context.current.quality === "INVALID" ? context.current.unit : context.current.unit}" is not a recognized weighbridge unit.`
        : corrupt
          ? "The numeric weight value is not finite."
          : `The indicator reported ${quality}.`;
    return hit("NEGATIVE_OR_INVALID_WEIGHT", this.id, negative || corrupt ? "ERROR" : "WARNING", context, {
      title: "Measurement Anomaly",
      description: "The weighbridge produced a negative, invalid, or corrupt reading.",
      explanation: reason,
      confirmedImmediately: true,
    });
  },
};

export const RULE_DETECTORS: WeightAnomalyDetector[] = [
  invalidWeightDetector,
  emptyPlatformDetector,
  weightJumpDetector,
  suddenWeightChangeDetector,
  repeatedInstabilityDetector,
];

export const FUTURE_DETECTOR_SLOTS: Array<{ id: string; kind: "STATISTICAL" | "ML"; note: string }> = [
  { id: "statistical.zero_drift", kind: "STATISTICAL", note: "Reserved. Not implemented in Step 16." },
  { id: "statistical.long_term_drift", kind: "STATISTICAL", note: "Reserved. Not implemented in Step 16." },
  { id: "ml.pattern_detector", kind: "ML", note: "Reserved. Not implemented in Step 16." },
];
