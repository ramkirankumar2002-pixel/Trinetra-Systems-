import { kgToMilligrams } from "./netWeight.js";
import type { WeightQuality } from "./weightQuality.js";

export type StabilityConfig = {
  /** Inclusive milligram span allowed across the stability window. */
  toleranceMilliKg: bigint;
  consecutiveReadings: number;
  durationMs: number;
};

export const DEFAULT_SIMULATOR_STABILITY: StabilityConfig = {
  toleranceMilliKg: 5000n,
  consecutiveReadings: 3,
  durationMs: 1000,
};

export function stabilityConfigFromKg(input: {
  toleranceKg: string;
  consecutiveReadings: number;
  durationMs: number;
}): StabilityConfig | string {
  if (!Number.isInteger(input.consecutiveReadings) || input.consecutiveReadings < 2 || input.consecutiveReadings > 50) {
    return "Stability consecutive readings must be between 2 and 50";
  }
  if (!Number.isInteger(input.durationMs) || input.durationMs < 200 || input.durationMs > 60_000) {
    return "Stability duration must be between 200 and 60000 milliseconds";
  }
  try {
    const toleranceMilliKg = kgToMilligrams(input.toleranceKg);
    if (toleranceMilliKg < 0n) {
      return "Stability tolerance cannot be negative";
    }
    return {
      toleranceMilliKg,
      consecutiveReadings: input.consecutiveReadings,
      durationMs: input.durationMs,
    };
  } catch {
    return "Stability tolerance must be a kilogram decimal with up to 3 places";
  }
}

type Sample = {
  milliKg: bigint;
  atMs: number;
};

export class StabilityTracker {
  private samples: Sample[] = [];

  constructor(private readonly config: StabilityConfig) {}

  reset(): void {
    this.samples = [];
  }

  add(milliKg: bigint, at: Date = new Date()): WeightQuality {
    this.samples.push({ milliKg, atMs: at.getTime() });
    const keep = Math.max(this.config.consecutiveReadings, 8);
    if (this.samples.length > keep) {
      this.samples = this.samples.slice(-keep);
    }
    return this.quality();
  }

  quality(): WeightQuality {
    const needed = this.config.consecutiveReadings;
    if (this.samples.length < needed) {
      return "UNSTABLE";
    }

    const window = this.samples.slice(-needed);
    const first = window[0];
    const last = window[window.length - 1];
    if (!first || !last) {
      return "UNSTABLE";
    }

    if (last.atMs - first.atMs < this.config.durationMs) {
      return "UNSTABLE";
    }

    let min = window[0]!.milliKg;
    let max = window[0]!.milliKg;
    for (const sample of window) {
      if (sample.milliKg < min) {
        min = sample.milliKg;
      }
      if (sample.milliKg > max) {
        max = sample.milliKg;
      }
    }

    return max - min <= this.config.toleranceMilliKg ? "STABLE" : "UNSTABLE";
  }
}
