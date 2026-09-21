export type LocalAnomalyType =
  | "EMPTY_PLATFORM_WEIGHT"
  | "SUDDEN_WEIGHT_CHANGE"
  | "WEIGHT_JUMP"
  | "REPEATED_INSTABILITY"
  | "NEGATIVE_OR_INVALID_WEIGHT";

export type LocalAnomalyConfig = {
  emptyPlatformThresholdKg: number;
  maxChangePerSecondKg: number;
  weightJumpThresholdKg: number;
  maxInstabilityDurationMs: number;
  consecutiveAnomalyCount: number;
};

export type LocalAnomalySample = {
  timestampMs: number;
  weightKg: number | null;
  quality: string;
};

export type LocalAnomalyHit = {
  type: LocalAnomalyType;
  title: string;
  description: string;
  explanation: string;
  observedWeightKg: number | null;
  previousWeightKg: number | null;
};

export class LocalAnomalyDetector {
  private readonly history: LocalAnomalySample[] = [];

  evaluate(
    sample: LocalAnomalySample,
    config: LocalAnomalyConfig,
    platformState: "EMPTY" | "VEHICLE_PRESENT" | "UNKNOWN",
  ): LocalAnomalyHit | null {
    const previous = this.history[this.history.length - 1] ?? null;
    this.history.push(sample);
    if (this.history.length > 32) {
      this.history.shift();
    }

    if (sample.weightKg !== null && sample.weightKg < 0) {
      return hit("NEGATIVE_OR_INVALID_WEIGHT", sample.weightKg, previous?.weightKg ?? null, "Negative weight is invalid.");
    }
    if (sample.quality === "INVALID" || sample.quality === "DEVICE_ERROR") {
      return hit("NEGATIVE_OR_INVALID_WEIGHT", sample.weightKg, previous?.weightKg ?? null, "Indicator reported an invalid reading.");
    }
    if (
      platformState === "EMPTY" &&
      sample.weightKg !== null &&
      sample.weightKg > config.emptyPlatformThresholdKg
    ) {
      return hit(
        "EMPTY_PLATFORM_WEIGHT",
        sample.weightKg,
        previous?.weightKg ?? null,
        `Empty platform reported ${sample.weightKg} kg above the cached ${config.emptyPlatformThresholdKg} kg threshold.`,
      );
    }
    if (previous && sample.weightKg !== null && previous.weightKg !== null) {
      const delta = Math.abs(sample.weightKg - previous.weightKg);
      if (delta >= config.weightJumpThresholdKg) {
        return hit("WEIGHT_JUMP", sample.weightKg, previous.weightKg, `Weight jumped ${delta} kg.`);
      }
      const elapsedSec = Math.max(0.2, (sample.timestampMs - previous.timestampMs) / 1000);
      if (delta / elapsedSec >= config.maxChangePerSecondKg) {
        return hit(
          "SUDDEN_WEIGHT_CHANGE",
          sample.weightKg,
          previous.weightKg,
          `Weight changed faster than the cached ${config.maxChangePerSecondKg} kg/s limit.`,
        );
      }
    }
    const unstable = this.history.filter((item) => item.quality === "UNSTABLE");
    const recentUnstable = unstable.slice(-config.consecutiveAnomalyCount);
    if (
      sample.quality === "UNSTABLE" &&
      recentUnstable.length >= config.consecutiveAnomalyCount &&
      sample.timestampMs - (this.history[0]?.timestampMs ?? sample.timestampMs) >= config.maxInstabilityDurationMs
    ) {
      return hit("REPEATED_INSTABILITY", sample.weightKg, previous?.weightKg ?? null, "Indicator remained unstable.");
    }
    return null;
  }

  reset(): void {
    this.history.length = 0;
  }
}

function hit(
  type: LocalAnomalyType,
  observedWeightKg: number | null,
  previousWeightKg: number | null,
  explanation: string,
): LocalAnomalyHit {
  return {
    type,
    title: type.replaceAll("_", " "),
    description: "Local weight anomaly detected while disconnected from the central backend.",
    explanation,
    observedWeightKg,
    previousWeightKg,
  };
}
