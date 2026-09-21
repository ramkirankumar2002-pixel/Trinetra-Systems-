import type { WeightQuality } from "../weightQuality.js";

export const WEIGHT_ANOMALY_SCENARIOS = [
  "NORMAL_EMPTY",
  "ZERO_DRIFT",
  "EMPTY_ANOMALY",
  "WEIGHT_JUMP",
  "REPEATED_INSTABILITY",
  "NEGATIVE",
  "INVALID",
  "RECOVERY",
  "MAINTENANCE_ABNORMAL",
] as const;

export type WeightAnomalyScenario = (typeof WEIGHT_ANOMALY_SCENARIOS)[number];

export type ScenarioReading = {
  weightKg: number | null;
  quality: WeightQuality;
  unit: string;
  intervalMs: number;
};

export function isWeightAnomalyScenario(value: string): value is WeightAnomalyScenario {
  return (WEIGHT_ANOMALY_SCENARIOS as readonly string[]).includes(value);
}

export function scenarioReadings(scenario: WeightAnomalyScenario): ScenarioReading[] {
  switch (scenario) {
    case "NORMAL_EMPTY":
      return kgSequence([0, 2, 4, 3], "STABLE");
    case "ZERO_DRIFT":
      return kgSequence([2, 4, 6, 5], "STABLE");
    case "EMPTY_ANOMALY":
      return kgSequence([3, 4, 850, 860], "STABLE");
    case "WEIGHT_JUMP":
      return kgSequence([12500, 12510, 18000], "STABLE");
    case "REPEATED_INSTABILITY":
      return [
        reading(12500, "STABLE", 400),
        reading(12540, "UNSTABLE", 400),
        reading(12610, "UNSTABLE", 400),
        reading(12480, "UNSTABLE", 400),
        reading(12720, "UNSTABLE", 400),
        reading(12390, "UNSTABLE", 400),
      ];
    case "NEGATIVE":
      return [reading(-500, "STABLE", 400)];
    case "INVALID":
      return [reading(null, "INVALID", 400)];
    case "RECOVERY":
      return kgSequence([850, 860, 4, 3], "STABLE");
    case "MAINTENANCE_ABNORMAL":
      return kgSequence([850, 860], "STABLE");
    default: {
      const _exhaustive: never = scenario;
      return _exhaustive;
    }
  }
}

function kgSequence(values: number[], quality: WeightQuality): ScenarioReading[] {
  return values.map((weightKg) => reading(weightKg, quality, 400));
}

function reading(weightKg: number | null, quality: WeightQuality, intervalMs: number): ScenarioReading {
  return { weightKg, quality, unit: "KG", intervalMs };
}
