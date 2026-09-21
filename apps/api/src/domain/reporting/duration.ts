import { INSUFFICIENT_DATA } from "./datePresets.js";

export type DurationMetric = {
  milliseconds: number | null;
  label: string;
  data: "actual" | "insufficient";
};

export function durationBetween(start: Date | null | undefined, end: Date | null | undefined): DurationMetric {
  if (!start || !end) {
    return { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" };
  }
  const milliseconds = end.getTime() - start.getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" };
  }
  return { milliseconds, label: formatDurationMs(milliseconds), data: "actual" };
}

export function averageDuration(samplesMs: number[]): DurationMetric {
  if (samplesMs.length === 0) {
    return { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" };
  }
  const total = samplesMs.reduce((sum, value) => sum + value, 0);
  const milliseconds = Math.round(total / samplesMs.length);
  return { milliseconds, label: formatDurationMs(milliseconds), data: "actual" };
}

export function formatDurationMs(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  if (totalSeconds > 0) {
    return `${seconds}s`;
  }
  return `${milliseconds}ms`;
}

export function decimalSumToString(value: { toString(): string } | null | undefined): string {
  return value?.toString() ?? "0";
}
