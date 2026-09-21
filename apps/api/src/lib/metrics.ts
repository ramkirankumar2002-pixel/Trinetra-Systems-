import type {
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  MetricLabels,
  MetricsSnapshot,
} from "../domain/observability/metrics.js";
import { METRIC_NAMES } from "../domain/observability/metrics.js";

type RecentSample = {
  at: number;
  status: number;
  durationMs: number;
};

type CounterEntry = { help: string; value: number; labels: MetricLabels };
type GaugeEntry = { help: string; value: number; labels: MetricLabels };
type HistogramEntry = { help: string; count: number; sum: number; max: number; labels: MetricLabels };

const WINDOW_MS = 5 * 60 * 1000;
const MAX_RECENT = 2000;

function labelKey(labels: MetricLabels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

export class InMemoryMetricsRegistry {
  readonly startedAt = new Date();
  private readonly counters = new Map<string, CounterEntry>();
  private readonly gauges = new Map<string, GaugeEntry>();
  private readonly histograms = new Map<string, HistogramEntry>();
  private recent: RecentSample[] = [];

  increment(name: string, help: string, labels: MetricLabels = {}, amount = 1): void {
    const key = `${name}|${labelKey(labels)}`;
    const current = this.counters.get(key);
    if (current) {
      current.value += amount;
      return;
    }
    this.counters.set(key, { help, value: amount, labels });
  }

  setGauge(name: string, help: string, value: number, labels: MetricLabels = {}): void {
    this.gauges.set(`${name}|${labelKey(labels)}`, { help, value, labels });
  }

  observe(name: string, help: string, value: number, labels: MetricLabels = {}): void {
    const key = `${name}|${labelKey(labels)}`;
    const current = this.histograms.get(key);
    if (current) {
      current.count += 1;
      current.sum += value;
      current.max = Math.max(current.max, value);
      return;
    }
    this.histograms.set(key, { help, count: 1, sum: value, max: value, labels });
  }

  recordApiSample(status: number, durationMs: number): void {
    this.recent.push({ at: Date.now(), status, durationMs });
    if (this.recent.length > MAX_RECENT) {
      this.recent = this.recent.slice(-MAX_RECENT);
    }
  }

  windowStats(now = Date.now(), slowMs = 2000): { requests: number; errors: number; slow: number } {
    const windowStart = now - WINDOW_MS;
    let requests = 0;
    let errors = 0;
    let slow = 0;
    for (const sample of this.recent) {
      if (sample.at < windowStart) {
        continue;
      }
      requests += 1;
      if (sample.status >= 500) {
        errors += 1;
      }
      if (sample.durationMs >= slowMs) {
        slow += 1;
      }
    }
    return { requests, errors, slow };
  }

  windowErrorRate(now = Date.now()): { requests: number; errors: number; rate: number } {
    const stats = this.windowStats(now);
    return {
      requests: stats.requests,
      errors: stats.errors,
      rate: stats.requests === 0 ? 0 : stats.errors / stats.requests,
    };
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAt: this.startedAt.toISOString(),
      generatedAt: new Date().toISOString(),
      storage: "memory",
      limitation: "In-memory metrics are not sufficient for production long-term historical monitoring.",
      counters: [...this.counters.entries()].map(([key, entry]) => toCounter(key, entry)),
      gauges: [...this.gauges.entries()].map(([key, entry]) => toGauge(key, entry)),
      histograms: [...this.histograms.entries()].map(([key, entry]) => toHistogram(key, entry)),
    };
  }

  toPrometheusText(): string {
    const lines: string[] = [
      "# Trinetra in-memory metrics exposition. Not a Prometheus deployment.",
      "# In-memory metrics are not sufficient for production long-term historical monitoring.",
    ];
    const snapshot = this.snapshot();
    for (const counter of snapshot.counters) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      lines.push(`${counter.name}${formatPromLabels(counter.labels)} ${counter.value}`);
    }
    for (const gauge of snapshot.gauges) {
      lines.push(`# HELP ${gauge.name} ${gauge.help}`);
      lines.push(`# TYPE ${gauge.name} gauge`);
      lines.push(`${gauge.name}${formatPromLabels(gauge.labels)} ${gauge.value}`);
    }
    for (const histogram of snapshot.histograms) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} summary`);
      lines.push(`${histogram.name}_count${formatPromLabels(histogram.labels)} ${histogram.count}`);
      lines.push(`${histogram.name}_sum${formatPromLabels(histogram.labels)} ${histogram.sum}`);
      lines.push(`${histogram.name}_max${formatPromLabels(histogram.labels)} ${histogram.max}`);
    }
    return `${lines.join("\n")}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.recent = [];
  }
}

function toCounter(_key: string, entry: CounterEntry): CounterMetric {
  return { name: entryName(_key), help: entry.help, value: entry.value, labels: entry.labels };
}

function toGauge(_key: string, entry: GaugeEntry): GaugeMetric {
  return { name: entryName(_key), help: entry.help, value: entry.value, labels: entry.labels };
}

function toHistogram(_key: string, entry: HistogramEntry): HistogramMetric {
  return {
    name: entryName(_key),
    help: entry.help,
    count: entry.count,
    sum: entry.sum,
    max: entry.max,
    labels: entry.labels,
  };
}

function entryName(key: string): string {
  const separator = key.indexOf("|");
  return separator === -1 ? key : key.slice(0, separator);
}

function formatPromLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) {
    return "";
  }
  return `{${entries.map(([key, value]) => `${key}="${escapeProm(value)}"`).join(",")}}`;
}

function escapeProm(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n");
}

export const metrics = new InMemoryMetricsRegistry();

export function recordApiRequest(input: {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}): void {
  const labels = { method: input.method, route: input.route, status: String(input.status) };
  metrics.increment(METRIC_NAMES.apiRequests, "HTTP requests handled by the API", labels);
  metrics.observe(METRIC_NAMES.apiDuration, "HTTP request duration in milliseconds", input.durationMs, {
    method: input.method,
    route: input.route,
  });
  if (input.status >= 400) {
    metrics.increment(METRIC_NAMES.apiErrors, "HTTP responses with status >= 400", labels);
  }
  if (input.status === 401) {
    metrics.increment(METRIC_NAMES.authFailures, "Authentication failures", {});
  }
  if (input.status === 403) {
    metrics.increment(METRIC_NAMES.authzFailures, "Authorization failures", {});
  }
  metrics.recordApiSample(input.status, input.durationMs);
}

export function recordDbQuery(input: { durationMs: number; failed: boolean }): void {
  metrics.increment(METRIC_NAMES.dbQueries, "Database queries observed", {});
  metrics.observe(METRIC_NAMES.dbDuration, "Database query duration in milliseconds", input.durationMs, {});
  if (input.failed) {
    metrics.increment(METRIC_NAMES.dbErrors, "Database query failures", {});
  }
}

export function recordWeighbridgeReading(quality: string | null): void {
  metrics.increment(METRIC_NAMES.weighbridgeReadings, "Weighbridge readings observed", {});
  if (quality === "UNSTABLE") {
    metrics.increment(METRIC_NAMES.weighbridgeUnstable, "Unstable weighbridge readings", {});
  }
  if (quality === "NO_DATA" || quality === "DEVICE_ERROR" || quality === "INVALID") {
    metrics.increment(METRIC_NAMES.weighbridgeProviderFailures, "Weighbridge reading failures", {});
  }
}

export function recordOcrAttempt(failed: boolean): void {
  metrics.increment(METRIC_NAMES.ocrRequests, "OCR processing requests", {});
  if (failed) {
    metrics.increment(METRIC_NAMES.ocrFailures, "OCR processing failures", {});
  }
}
