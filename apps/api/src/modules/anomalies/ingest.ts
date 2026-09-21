import {
  MaintenanceStatus,
  NotificationSeverity,
  Prisma,
  SecurityCategory,
  SecurityEventSource,
  SecurityEventStatus,
  WeightAnomalyStatus,
  WeightAnomalyTimelineKind,
  type TransactionStatus,
} from "@prisma/client";
import {
  CONFIG_CACHE_MS,
  CONTEXT_CACHE_MS,
  DEVELOPMENT_DEFAULT_ANOMALY_CONFIG,
  DEVELOPMENT_DEFAULT_LABEL,
  MAX_ANOMALY_OBSERVATIONS,
  MAX_ANOMALY_WINDOW,
  PERSIST_OBSERVATION_INTERVAL_MS,
} from "../../domain/weightAnomaly/config.js";
import { evaluateWeightAnomaly, sampleFromWeight } from "../../domain/weightAnomaly/engine.js";
import { derivePlatformState } from "../../domain/weightAnomaly/platformState.js";
import { toSecuritySeverity } from "../../domain/weightAnomaly/severity.js";
import type {
  AnomalySample,
  CandidateState,
  DetectorHit,
  WeighbridgePlatformState,
  WeightAnomalyConfigValues,
  WeightAnomalyType,
} from "../../domain/weightAnomaly/types.js";
import type { NormalizedWeightReading } from "../../domain/normalizedWeight.js";
import { prisma } from "../../db/client.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { emitWeightAnomalyAlert } from "./alerts.js";

type RuntimeState = {
  window: AnomalySample[];
  candidates: Map<WeightAnomalyType, CandidateState>;
  lastObservationAt: Map<string, number>;
  context: CachedContext | null;
  contextAt: number;
  config: WeightAnomalyConfigValues | null;
  configAt: number;
};

type CachedContext = {
  organizationId: string;
  siteId: string;
  weighbridgeCode: string;
  hasActiveMaintenance: boolean;
  openTransactionId: string | null;
  openTransactionStatus: TransactionStatus | null;
  platformState: WeighbridgePlatformState;
};

const runtimes = new Map<string, RuntimeState>();

export type IngestNormalizedInput = {
  weighbridgeId: string;
  organizationId?: string;
  siteId?: string;
  deviceId?: string;
  transactionId?: string | null;
  reading: NormalizedWeightReading;
  platformStateOverride?: WeighbridgePlatformState;
  nowMs?: number;
};

export type IngestResult = {
  createdEventIds: string[];
  updatedEventIds: string[];
  recoveredEventIds: string[];
  suppressed: boolean;
};

export function resetWeightAnomalyRuntime(weighbridgeId?: string): void {
  if (weighbridgeId) {
    runtimes.delete(weighbridgeId);
    return;
  }
  runtimes.clear();
}

export function sampleFromNormalized(reading: NormalizedWeightReading, nowMs = Date.now()): AnomalySample {
  const parsed = Number(reading.weightKg);
  const finite = Number.isFinite(parsed);
  const timestampMs = Number.isFinite(Date.parse(reading.timestamp)) ? Date.parse(reading.timestamp) : nowMs;
  if (reading.quality === "INVALID" || reading.quality === "NO_DATA" || reading.quality === "DEVICE_ERROR") {
    return {
      timestampMs,
      weightKg: finite ? parsed : null,
      quality: reading.quality,
      unit: reading.unit,
      valid: false,
    };
  }
  return sampleFromWeight({
    timestampMs,
    weightKg: finite ? parsed : null,
    quality: reading.quality,
    unit: reading.unit,
  });
}

export async function ingestNormalizedReading(input: IngestNormalizedInput): Promise<IngestResult> {
  const nowMs = input.nowMs ?? Date.now();
  const runtime = runtimeFor(input.weighbridgeId);
  const context = await loadContext(input, runtime, nowMs);
  if (context.organizationId === "unknown") {
    return { createdEventIds: [], updatedEventIds: [], recoveredEventIds: [], suppressed: false };
  }
  const config = await loadConfig(input.weighbridgeId, runtime, nowMs);
  const sample = sampleFromNormalized(input.reading, nowMs);
  const platformState = input.platformStateOverride ?? context.platformState;
  const evaluation = evaluateWeightAnomaly({
    sample,
    history: runtime.window,
    platformState,
    config,
    candidates: runtime.candidates,
  });
  runtime.window = evaluation.window.slice(-MAX_ANOMALY_WINDOW);
  runtime.candidates = evaluation.candidates;

  const suppressed = platformState === "MAINTENANCE" && config.suppressAlertsInMaintenance;
  const createdEventIds: string[] = [];
  const updatedEventIds: string[] = [];
  const recoveredEventIds: string[] = [];
  const transactionId = input.transactionId === undefined ? context.openTransactionId : input.transactionId;

  for (const hit of evaluation.confirmedHits) {
    const result = await persistHit({
      weighbridgeId: input.weighbridgeId,
      context,
      config,
      hit,
      sample,
      platformState,
      suppressed,
      detectionSource: sourceFromReading(input.reading),
      deviceId: input.deviceId ?? null,
      transactionId,
      nowMs,
      lastObservationAt: runtime.lastObservationAt,
    });
    if (result.created) {
      createdEventIds.push(result.eventId);
    } else {
      updatedEventIds.push(result.eventId);
    }
  }

  for (const type of evaluation.recoveredTypes) {
    const recovered = await persistRecovery({
      weighbridgeId: input.weighbridgeId,
      type,
      sample,
      platformState,
      nowMs,
    });
    if (recovered) {
      recoveredEventIds.push(recovered);
    }
  }

  return { createdEventIds, updatedEventIds, recoveredEventIds, suppressed };
}

function runtimeFor(weighbridgeId: string): RuntimeState {
  const existing = runtimes.get(weighbridgeId);
  if (existing) {
    return existing;
  }
  if (runtimes.size > 256) {
    const first = runtimes.keys().next().value;
    if (first) {
      runtimes.delete(first);
    }
  }
  const created: RuntimeState = {
    window: [],
    candidates: new Map(),
    lastObservationAt: new Map(),
    context: null,
    contextAt: 0,
    config: null,
    configAt: 0,
  };
  runtimes.set(weighbridgeId, created);
  return created;
}

async function loadContext(
  input: IngestNormalizedInput,
  runtime: RuntimeState,
  nowMs: number,
): Promise<CachedContext> {
  if (runtime.context && nowMs - runtime.contextAt < CONTEXT_CACHE_MS) {
    return runtime.context;
  }
  const weighbridge = await prisma.weighbridge.findUnique({
    where: { id: input.weighbridgeId },
    select: { id: true, organizationId: true, siteId: true, code: true },
  });
  if (!weighbridge) {
    const fallback: CachedContext = {
      organizationId: input.organizationId ?? "unknown",
      siteId: input.siteId ?? "unknown",
      weighbridgeCode: input.weighbridgeId,
      hasActiveMaintenance: false,
      openTransactionId: null,
      openTransactionStatus: null,
      platformState: "UNKNOWN",
    };
    runtime.context = fallback;
    runtime.contextAt = nowMs;
    return fallback;
  }
  const [maintenance, openTransaction] = await Promise.all([
    prisma.maintenanceEvent.findFirst({
      where: { weighbridgeId: weighbridge.id, status: MaintenanceStatus.ACTIVE },
      select: { id: true },
    }),
    prisma.transaction.findFirst({
      where: {
        weighbridgeId: weighbridge.id,
        status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] },
      },
      orderBy: { arrivedAt: "desc" },
      select: { id: true, status: true },
    }),
  ]);
  const context: CachedContext = {
    organizationId: weighbridge.organizationId,
    siteId: weighbridge.siteId,
    weighbridgeCode: weighbridge.code,
    hasActiveMaintenance: maintenance !== null,
    openTransactionId: openTransaction?.id ?? null,
    openTransactionStatus: openTransaction?.status ?? null,
    platformState: derivePlatformState({
      hasActiveMaintenance: maintenance !== null,
      openTransactionStatus: openTransaction?.status ?? null,
    }),
  };
  runtime.context = context;
  runtime.contextAt = nowMs;
  return context;
}

async function loadConfig(
  weighbridgeId: string,
  runtime: RuntimeState,
  nowMs: number,
): Promise<WeightAnomalyConfigValues> {
  if (runtime.config && nowMs - runtime.configAt < CONFIG_CACHE_MS) {
    return runtime.config;
  }
  const row = await prisma.weightAnomalyConfig.findUnique({ where: { weighbridgeId } });
  const config = row
    ? {
        emptyPlatformThresholdKg: Number(row.emptyPlatformThresholdKg.toString()),
        maxChangePerSecondKg: Number(row.maxChangePerSecondKg.toString()),
        weightJumpThresholdKg: Number(row.weightJumpThresholdKg.toString()),
        maxInstabilityDurationMs: row.maxInstabilityDurationMs,
        minAnomalyDurationMs: row.minAnomalyDurationMs,
        consecutiveAnomalyCount: row.consecutiveAnomalyCount,
        cooldownMs: row.cooldownMs,
        suddenChangeWindowMs: row.suddenChangeWindowMs,
        suppressAlertsInMaintenance: row.suppressAlertsInMaintenance,
      }
    : DEVELOPMENT_DEFAULT_ANOMALY_CONFIG;
  runtime.config = config;
  runtime.configAt = nowMs;
  return config;
}

export function invalidateAnomalyCaches(weighbridgeId: string): void {
  const runtime = runtimes.get(weighbridgeId);
  if (runtime) {
    runtime.context = null;
    runtime.config = null;
    runtime.contextAt = 0;
    runtime.configAt = 0;
  }
}

async function persistHit(input: {
  weighbridgeId: string;
  context: CachedContext;
  config: WeightAnomalyConfigValues;
  hit: DetectorHit;
  sample: AnomalySample;
  platformState: WeighbridgePlatformState;
  suppressed: boolean;
  detectionSource: string;
  deviceId: string | null;
  transactionId: string | null;
  nowMs: number;
  lastObservationAt: Map<string, number>;
}): Promise<{ eventId: string; created: boolean }> {
  const existing = await prisma.weightAnomalyEvent.findFirst({
    where: {
      weighbridgeId: input.weighbridgeId,
      type: input.hit.type,
      status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] },
    },
    orderBy: { lastDetectedAt: "desc" },
  });

  const now = new Date(input.nowMs);
  const observed = decimalOrNull(input.hit.observedWeightKg);
  if (existing) {
    const recoveredAt = existing.recoveredAt?.getTime() ?? null;
    if (recoveredAt !== null && input.nowMs - recoveredAt >= input.config.cooldownMs) {
      return createEvent(input, now, observed);
    }
    const nextCount = existing.occurrenceCount + 1;
    const minObserved = minKg(existing.minObservedKg, input.hit.observedWeightKg);
    const maxObserved = maxKg(existing.maxObservedKg, input.hit.observedWeightKg);
    const sumObserved = addKg(existing.sumObservedKg, input.hit.observedWeightKg);
    const lastDetectedAt = input.nowMs >= existing.lastDetectedAt.getTime() ? now : existing.lastDetectedAt;
    await prisma.weightAnomalyEvent.update({
      where: { id: existing.id },
      data: {
        lastDetectedAt,
        occurrenceCount: nextCount,
        durationMs: Math.max(0, lastDetectedAt.getTime() - existing.firstDetectedAt.getTime()),
        observedWeightKg: observed,
        previousWeightKg: decimalOrNull(input.hit.previousWeightKg),
        minObservedKg: minObserved,
        maxObservedKg: maxObserved,
        sumObservedKg: sumObserved,
        recoveredAt: null,
        recoveredDurationMs: null,
        severity: input.hit.severity as NotificationSeverity,
        explanation: input.hit.explanation,
        platformState: input.platformState,
        ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      },
    });
    await maybeObserve({
      eventId: existing.id,
      kind: WeightAnomalyTimelineKind.PERSISTS,
      sample: input.sample,
      platformState: input.platformState,
      now,
      note: input.hit.explanation,
      lastObservationAt: input.lastObservationAt,
    });
    return { eventId: existing.id, created: false };
  }

  return createEvent(input, now, observed);
}

async function createEvent(
  input: {
    weighbridgeId: string;
    context: CachedContext;
    hit: DetectorHit;
    sample: AnomalySample;
    platformState: WeighbridgePlatformState;
    suppressed: boolean;
    detectionSource: string;
    deviceId: string | null;
    transactionId: string | null;
    nowMs: number;
    lastObservationAt: Map<string, number>;
  },
  now: Date,
  observed: Prisma.Decimal | null,
): Promise<{ eventId: string; created: boolean }> {
  const security = await prisma.securityEvent.create({
    data: {
      organizationId: input.context.organizationId,
      siteId: input.context.siteId,
      weighbridgeId: input.weighbridgeId,
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
      severity: toSecuritySeverity(input.hit.severity),
      category: SecurityCategory.WEIGHT_ANOMALY,
      title: input.hit.title,
      description: input.hit.explanation,
      source: input.detectionSource === "SIMULATOR" ? SecurityEventSource.SIMULATED : SecurityEventSource.RULE_ENGINE,
      correlationKey: `${input.weighbridgeId}:${input.hit.type}:${input.nowMs}`,
      status: SecurityEventStatus.OPEN,
      occurredAt: now,
    },
  });

  const event = await prisma.weightAnomalyEvent.create({
    data: {
      organizationId: input.context.organizationId,
      siteId: input.context.siteId,
      weighbridgeId: input.weighbridgeId,
      securityEventId: security.id,
      type: input.hit.type,
      status: WeightAnomalyStatus.OPEN,
      severity: input.hit.severity as NotificationSeverity,
      detectorKind: "RULE",
      ruleId: input.hit.ruleId,
      ruleVersion: input.hit.ruleVersion,
      title: input.hit.title,
      description: input.hit.description,
      explanation: input.hit.explanation,
      observedWeightKg: observed,
      previousWeightKg: decimalOrNull(input.hit.previousWeightKg),
      expectedMinKg: decimalOrNull(input.hit.expectedMinKg),
      expectedMaxKg: decimalOrNull(input.hit.expectedMaxKg),
      platformState: input.platformState,
      detectionSource: input.detectionSource,
      firstDetectedAt: now,
      lastDetectedAt: now,
      occurrenceCount: 1,
      durationMs: 0,
      minObservedKg: observed,
      maxObservedKg: observed,
      sumObservedKg: observed,
      suppressedDueToMaintenance: input.suppressed,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ...(input.transactionId ? { transactionId: input.transactionId } : {}),
    },
  });

  await prisma.weightAnomalyObservation.create({
    data: {
      eventId: event.id,
      recordedAt: now,
      kind: input.suppressed ? WeightAnomalyTimelineKind.SUPPRESSED : WeightAnomalyTimelineKind.DETECTED,
      weightKg: observed,
      quality: input.sample.quality,
      platformState: input.platformState,
      note: input.suppressed
        ? `Anomaly recorded. Alert suppressed because weighbridge is in MAINTENANCE. ${input.hit.explanation}`
        : input.hit.explanation,
    },
  });
  input.lastObservationAt.set(event.id, input.nowMs);

  await writeAudit({
    organizationId: input.context.organizationId,
    action: input.suppressed ? AUDIT_ACTIONS.WEIGHT_ANOMALY_SUPPRESSED : AUDIT_ACTIONS.WEIGHT_ANOMALY_DETECTED,
    entityType: "WeightAnomalyEvent",
    entityId: event.id,
    metadata: {
      type: input.hit.type,
      severity: input.hit.severity,
      weighbridgeId: input.weighbridgeId,
      observedWeightKg: input.hit.observedWeightKg,
      platformState: input.platformState,
      suppressed: input.suppressed,
      defaultsLabel: DEVELOPMENT_DEFAULT_LABEL,
    },
  });

  if (!input.suppressed) {
    emitWeightAnomalyAlert({
      organizationId: input.context.organizationId,
      siteId: input.context.siteId,
      weighbridgeId: input.weighbridgeId,
      weighbridgeCode: input.context.weighbridgeCode,
      eventId: event.id,
      observedWeightKg: input.hit.observedWeightKg,
      expectedMaxKg: input.hit.expectedMaxKg,
      platformState: input.platformState,
      explanation: input.hit.explanation,
      transactionId: input.transactionId,
    });
  }

  return { eventId: event.id, created: true };
}

async function persistRecovery(input: {
  weighbridgeId: string;
  type: WeightAnomalyType;
  sample: AnomalySample;
  platformState: WeighbridgePlatformState;
  nowMs: number;
}): Promise<string | null> {
  const existing = await prisma.weightAnomalyEvent.findFirst({
    where: {
      weighbridgeId: input.weighbridgeId,
      type: input.type,
      status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] },
      recoveredAt: null,
    },
    orderBy: { lastDetectedAt: "desc" },
  });
  if (!existing) {
    return null;
  }
  const now = new Date(input.nowMs);
  await prisma.weightAnomalyEvent.update({
    where: { id: existing.id },
    data: {
      recoveredAt: now,
      recoveredDurationMs: Math.max(0, input.nowMs - existing.firstDetectedAt.getTime()),
      durationMs: Math.max(0, input.nowMs - existing.firstDetectedAt.getTime()),
    },
  });
  await prisma.weightAnomalyObservation.create({
    data: {
      eventId: existing.id,
      recordedAt: now,
      kind: WeightAnomalyTimelineKind.RECOVERED,
      weightKg: decimalOrNull(input.sample.weightKg),
      quality: input.sample.quality,
      platformState: input.platformState,
      note: "Condition recovered. Anomaly history is retained.",
    },
  });
  await writeAudit({
    organizationId: existing.organizationId,
    action: AUDIT_ACTIONS.WEIGHT_ANOMALY_RECOVERED,
    entityType: "WeightAnomalyEvent",
    entityId: existing.id,
    metadata: { type: input.type, recoveredAt: now.toISOString() },
  });
  return existing.id;
}

async function maybeObserve(input: {
  eventId: string;
  kind: WeightAnomalyTimelineKind;
  sample: AnomalySample;
  platformState: WeighbridgePlatformState;
  now: Date;
  note: string;
  lastObservationAt: Map<string, number>;
}): Promise<void> {
  const previous = input.lastObservationAt.get(input.eventId) ?? 0;
  if (input.now.getTime() - previous < PERSIST_OBSERVATION_INTERVAL_MS) {
    return;
  }
  const count = await prisma.weightAnomalyObservation.count({ where: { eventId: input.eventId } });
  if (count >= MAX_ANOMALY_OBSERVATIONS) {
    return;
  }
  await prisma.weightAnomalyObservation.create({
    data: {
      eventId: input.eventId,
      recordedAt: input.now,
      kind: input.kind,
      weightKg: decimalOrNull(input.sample.weightKg),
      quality: input.sample.quality,
      platformState: input.platformState,
      note: input.note,
    },
  });
  input.lastObservationAt.set(input.eventId, input.now.getTime());
}

function sourceFromReading(reading: NormalizedWeightReading): string {
  if (reading.source === "HARDWARE") {
    return "HARDWARE";
  }
  if (reading.source === "SIMULATOR") {
    return "SIMULATOR";
  }
  return "MANUAL";
}

function decimalOrNull(value: number | null): Prisma.Decimal | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return new Prisma.Decimal(value.toFixed(3));
}

function minKg(current: Prisma.Decimal | null, incoming: number | null): Prisma.Decimal | null {
  if (incoming === null) {
    return current;
  }
  if (current === null) {
    return decimalOrNull(incoming);
  }
  return Number(current.toString()) <= incoming ? current : decimalOrNull(incoming);
}

function maxKg(current: Prisma.Decimal | null, incoming: number | null): Prisma.Decimal | null {
  if (incoming === null) {
    return current;
  }
  if (current === null) {
    return decimalOrNull(incoming);
  }
  return Number(current.toString()) >= incoming ? current : decimalOrNull(incoming);
}

function addKg(current: Prisma.Decimal | null, incoming: number | null): Prisma.Decimal | null {
  if (incoming === null) {
    return current;
  }
  const next = (current === null ? 0 : Number(current.toString())) + incoming;
  return decimalOrNull(next);
}
