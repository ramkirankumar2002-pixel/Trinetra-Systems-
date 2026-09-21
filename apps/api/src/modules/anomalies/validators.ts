import {
  isWeightAnomalySeverity,
  isWeightAnomalyStatus,
  isWeightAnomalyType,
} from "../../domain/weightAnomaly/types.js";
import { isWeightAnomalyScenario, type WeightAnomalyScenario } from "../../domain/weightAnomaly/scenarios.js";
import { HttpError } from "../../lib/httpError.js";
import type { WeightQuality } from "../../domain/weightQuality.js";
import { isWeightQuality } from "../../domain/weightQuality.js";

export function parseAnomalyListQuery(query: Record<string, unknown>): {
  siteId?: string;
  weighbridgeId?: string;
  type?: string;
  severity?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
} {
  const page = positiveInt(query.page, 1);
  const pageSize = Math.min(positiveInt(query.pageSize, 20), 100);
  return {
    ...(typeof query.siteId === "string" && query.siteId !== "" ? { siteId: query.siteId } : {}),
    ...(typeof query.weighbridgeId === "string" && query.weighbridgeId !== ""
      ? { weighbridgeId: query.weighbridgeId }
      : {}),
    ...(typeof query.type === "string" && isWeightAnomalyType(query.type) ? { type: query.type } : {}),
    ...(typeof query.severity === "string" && isWeightAnomalySeverity(query.severity)
      ? { severity: query.severity }
      : {}),
    ...(typeof query.status === "string" && isWeightAnomalyStatus(query.status) ? { status: query.status } : {}),
    ...(typeof query.from === "string" && query.from !== "" ? { from: new Date(query.from) } : {}),
    ...(typeof query.to === "string" && query.to !== "" ? { to: new Date(query.to) } : {}),
    page,
    pageSize,
  };
}

export function parseReviewReason(body: unknown, required: boolean): string | null {
  if (typeof body !== "object" || body === null) {
    if (required) {
      throw new HttpError(400, "A reason is required");
    }
    return null;
  }
  const reason = (body as Record<string, unknown>).reason;
  if (typeof reason !== "string" || reason.trim() === "") {
    if (required) {
      throw new HttpError(400, "A reason is required");
    }
    return null;
  }
  return reason.trim().slice(0, 500);
}

export type AnomalyConfigPatch = {
  emptyPlatformThresholdKg?: number;
  maxChangePerSecondKg?: number;
  weightJumpThresholdKg?: number;
  maxInstabilityDurationMs?: number;
  minAnomalyDurationMs?: number;
  consecutiveAnomalyCount?: number;
  cooldownMs?: number;
  suddenChangeWindowMs?: number;
  suppressAlertsInMaintenance?: boolean;
};

export function parseConfigPatch(body: unknown): {
  patch: AnomalyConfigPatch;
  reason: string;
} {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Configuration is required");
  }
  const record = body as Record<string, unknown>;
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";
  if (reason === "") {
    throw new HttpError(400, "A reason is required for threshold changes");
  }
  const patch: AnomalyConfigPatch = {};
  assignNumber(patch, record, "emptyPlatformThresholdKg");
  assignNumber(patch, record, "maxChangePerSecondKg");
  assignNumber(patch, record, "weightJumpThresholdKg");
  assignInt(patch, record, "maxInstabilityDurationMs");
  assignInt(patch, record, "minAnomalyDurationMs");
  assignInt(patch, record, "consecutiveAnomalyCount");
  assignInt(patch, record, "cooldownMs");
  assignInt(patch, record, "suddenChangeWindowMs");
  if (typeof record.suppressAlertsInMaintenance === "boolean") {
    patch.suppressAlertsInMaintenance = record.suppressAlertsInMaintenance;
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "No configuration fields were provided");
  }
  return { patch, reason };
}

export function parseScenarioBody(body: unknown): { scenario: WeightAnomalyScenario; transactionId: string | null } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Scenario is required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.scenario !== "string" || !isWeightAnomalyScenario(record.scenario)) {
    throw new HttpError(400, "Unknown anomaly scenario");
  }
  return {
    scenario: record.scenario,
    transactionId: typeof record.transactionId === "string" ? record.transactionId : null,
  };
}

export function parseFeedBody(body: unknown): Array<{
  weightKg: number | null;
  quality: WeightQuality;
  timestampMs?: number;
}> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Readings are required");
  }
  const readings = (body as Record<string, unknown>).readings;
  if (!Array.isArray(readings) || readings.length === 0 || readings.length > 40) {
    throw new HttpError(400, "Provide between 1 and 40 readings");
  }
  return readings.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new HttpError(400, "Each reading must be an object");
    }
    const row = item as Record<string, unknown>;
    const quality = typeof row.quality === "string" && isWeightQuality(row.quality) ? row.quality : "STABLE";
    const weightKg =
      row.weightKg === null || row.weightKg === undefined
        ? null
        : typeof row.weightKg === "number" || typeof row.weightKg === "string"
          ? Number(row.weightKg)
          : null;
    return {
      weightKg,
      quality,
      ...(typeof row.timestampMs === "number" ? { timestampMs: row.timestampMs } : {}),
    };
  });
}

export function parseMaintenanceStart(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Maintenance reason is required");
  }
  const reason = (body as Record<string, unknown>).reason;
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new HttpError(400, "Maintenance reason is required");
  }
  return reason.trim().slice(0, 500);
}

function assignNumber(target: AnomalyConfigPatch, record: Record<string, unknown>, key: keyof AnomalyConfigPatch): void {
  if (record[key] === undefined) {
    return;
  }
  const value = Number(record[key]);
  if (!Number.isFinite(value) || value < 0) {
    throw new HttpError(400, `${key} must be a non-negative number`);
  }
  (target as Record<string, number | boolean>)[key] = value;
}

function assignInt(target: AnomalyConfigPatch, record: Record<string, unknown>, key: keyof AnomalyConfigPatch): void {
  if (record[key] === undefined) {
    return;
  }
  const value = Number(record[key]);
  if (!Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${key} must be a non-negative integer`);
  }
  (target as Record<string, number | boolean>)[key] = value;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
