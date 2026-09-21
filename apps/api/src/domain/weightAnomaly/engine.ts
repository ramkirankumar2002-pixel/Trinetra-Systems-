import { MAX_ANOMALY_WINDOW } from "./config.js";
import { RULE_DETECTORS } from "./rules.js";
import {
  WEIGHT_ANOMALY_TYPES,
  type AnomalySample,
  type CandidateState,
  type DetectorHit,
  type EngineEvaluation,
  type WeighbridgePlatformState,
  type WeightAnomalyConfigValues,
  type WeightAnomalyType,
} from "./types.js";

export type EvaluateInput = {
  sample: AnomalySample;
  history: AnomalySample[];
  platformState: WeighbridgePlatformState;
  config: WeightAnomalyConfigValues;
  candidates?: Map<WeightAnomalyType, CandidateState>;
};

export function sampleFromWeight(input: {
  timestampMs: number;
  weightKg: number | null;
  quality: AnomalySample["quality"];
  unit?: string;
}): AnomalySample {
  const finite = input.weightKg !== null && Number.isFinite(input.weightKg);
  const valid =
    finite && (input.quality === "STABLE" || input.quality === "UNSTABLE") && (input.weightKg ?? 0) >= 0;
  return {
    timestampMs: input.timestampMs,
    weightKg: input.weightKg,
    quality: input.quality,
    unit: input.unit ?? "KG",
    valid,
  };
}

export function evaluateWeightAnomaly(input: EvaluateInput): EngineEvaluation {
  const window = [...input.history, input.sample].slice(-MAX_ANOMALY_WINDOW);
  const previous = input.history[input.history.length - 1] ?? null;
  const { unstableDurationMs, consecutiveUnstable } = instabilityStats(window);
  const context = {
    current: input.sample,
    previous,
    window,
    platformState: input.platformState,
    config: input.config,
    unstableDurationMs,
    consecutiveUnstable,
  };

  const rawHits = RULE_DETECTORS.map((detector) => detector.evaluate(context)).filter(
    (hit): hit is DetectorHit => hit !== null,
  );
  const hits = preferJumpOverSudden(rawHits);
  const nextCandidates = new Map(input.candidates ?? []);
  const confirmedHits: DetectorHit[] = [];

  for (const type of WEIGHT_ANOMALY_TYPES) {
    const hit = hits.find((item) => item.type === type) ?? null;
    if (!hit) {
      nextCandidates.delete(type);
      continue;
    }
    const existing = nextCandidates.get(type);
    const firstMs = existing?.firstMs ?? input.sample.timestampMs;
    const count = (existing?.count ?? 0) + 1;
    nextCandidates.set(type, { firstMs, count });
    const durationMs = input.sample.timestampMs - firstMs;
    if (
      hit.confirmedImmediately ||
      count >= input.config.consecutiveAnomalyCount ||
      durationMs >= input.config.minAnomalyDurationMs
    ) {
      confirmedHits.push(hit);
    }
  }

  const recoveredTypes = WEIGHT_ANOMALY_TYPES.filter((type) => !hits.some((hit) => hit.type === type));

  return {
    hits,
    confirmedHits,
    recoveredTypes,
    window,
    candidates: nextCandidates,
  };
}

function preferJumpOverSudden(hits: DetectorHit[]): DetectorHit[] {
  if (hits.some((hit) => hit.type === "WEIGHT_JUMP")) {
    return hits.filter((hit) => hit.type !== "SUDDEN_WEIGHT_CHANGE");
  }
  return hits;
}

function instabilityStats(window: AnomalySample[]): { unstableDurationMs: number; consecutiveUnstable: number } {
  let consecutiveUnstable = 0;
  for (let index = window.length - 1; index >= 0; index -= 1) {
    if (window[index]?.quality !== "UNSTABLE") {
      break;
    }
    consecutiveUnstable += 1;
  }
  if (consecutiveUnstable === 0) {
    return { unstableDurationMs: 0, consecutiveUnstable: 0 };
  }
  const start = window[window.length - consecutiveUnstable];
  const end = window[window.length - 1];
  return {
    unstableDurationMs: (end?.timestampMs ?? 0) - (start?.timestampMs ?? 0),
    consecutiveUnstable,
  };
}
