export type MonitoringThresholds = {
  slowRequestMs: number;
  slowQueryMs: number;
  apiErrorRate: number;
  minSampleSize: number;
  syncQueueWarn: number;
  failedSyncWarn: number;
  dbLatencyWarnMs: number;
};

export const DEFAULT_MONITORING_THRESHOLDS: MonitoringThresholds = {
  slowRequestMs: 2000,
  slowQueryMs: 500,
  apiErrorRate: 0.2,
  minSampleSize: 20,
  syncQueueWarn: 100,
  failedSyncWarn: 10,
  dbLatencyWarnMs: 500,
};

export function apiErrorRateExceeded(input: {
  requests: number;
  errors: number;
  minSampleSize: number;
  threshold: number;
}): boolean {
  if (input.requests < input.minSampleSize) {
    return false;
  }
  return input.errors / input.requests >= input.threshold;
}
