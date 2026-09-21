export type MetricLabels = Record<string, string>;

export type CounterMetric = {
  name: string;
  help: string;
  value: number;
  labels: MetricLabels;
};

export type GaugeMetric = {
  name: string;
  help: string;
  value: number;
  labels: MetricLabels;
};

export type HistogramMetric = {
  name: string;
  help: string;
  count: number;
  sum: number;
  max: number;
  labels: MetricLabels;
};

export type MetricsSnapshot = {
  startedAt: string;
  generatedAt: string;
  storage: "memory";
  limitation: "In-memory metrics are not sufficient for production long-term historical monitoring.";
  counters: CounterMetric[];
  gauges: GaugeMetric[];
  histograms: HistogramMetric[];
};

export const METRIC_NAMES = {
  apiRequests: "api_requests_total",
  apiErrors: "api_errors_total",
  apiDuration: "api_request_duration_ms",
  dbQueries: "db_queries_total",
  dbErrors: "db_query_errors_total",
  dbDuration: "db_query_duration_ms",
  weighbridgeReadings: "weighbridge_readings_total",
  weighbridgeUnstable: "weighbridge_unstable_readings_total",
  weighbridgeProviderFailures: "weighbridge_provider_failures_total",
  ocrRequests: "ocr_requests_total",
  ocrFailures: "ocr_failures_total",
  authFailures: "authentication_failures_total",
  authzFailures: "authorization_failures_total",
} as const;
