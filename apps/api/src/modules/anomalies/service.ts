import {
  MaintenanceStatus,
  Prisma,
  SecurityEventStatus,
  WeightAnomalyStatus,
  WeightAnomalyTimelineKind,
} from "@prisma/client";
import { DEVELOPMENT_DEFAULT_ANOMALY_CONFIG, DEVELOPMENT_DEFAULT_LABEL } from "../../domain/weightAnomaly/config.js";
import { derivePlatformState } from "../../domain/weightAnomaly/platformState.js";
import { scenarioReadings, type WeightAnomalyScenario } from "../../domain/weightAnomaly/scenarios.js";
import type { WeighbridgePlatformState } from "../../domain/weightAnomaly/types.js";
import { emptyReading, readingFromMilliKg } from "../../domain/normalizedWeight.js";
import { kgToMilligrams } from "../../domain/netWeight.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { getConnectionManager } from "../../integrations/weighbridge/connectionManager.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, assertRequestedScope } from "../shared/siteScope.js";
import { getAccessibleWeighbridge } from "../weighbridges/service.js";
import { ingestNormalizedReading, invalidateAnomalyCaches, resetWeightAnomalyRuntime } from "./ingest.js";
import {
  toPublicAnomalyConfig,
  toPublicObservation,
  toPublicWeightAnomaly,
  type PublicAnomalyConfig,
  type PublicAnomalyObservation,
  type PublicWeightAnomaly,
  type PublicWeightHealth,
} from "./mapper.js";
import {
  parseAnomalyListQuery,
  parseConfigPatch,
  parseFeedBody,
  parseMaintenanceStart,
  parseReviewReason,
  parseScenarioBody,
} from "./validators.js";

const eventInclude = {
  weighbridge: { select: { id: true, code: true, name: true } },
  site: { select: { id: true, code: true, name: true } },
  transaction: { select: { referenceNumber: true } },
} as const;

export async function listWeightAnomalies(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicWeightAnomaly[]; page: number; pageSize: number; total: number }> {
  const filters = parseAnomalyListQuery(query);
  await assertRequestedScope(actor, { siteId: filters.siteId, weighbridgeId: filters.weighbridgeId });
  const where = anomalyWhere(actor, filters);
  const [total, rows] = await Promise.all([
    prisma.weightAnomalyEvent.count({ where }),
    prisma.weightAnomalyEvent.findMany({
      where,
      include: eventInclude,
      orderBy: { firstDetectedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);
  return {
    items: rows.map(toPublicWeightAnomaly),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

export async function getWeightAnomaly(
  actor: ActorContext,
  eventId: string,
): Promise<{ event: PublicWeightAnomaly; timeline: PublicAnomalyObservation[] }> {
  const event = await loadAccessibleEvent(actor, eventId);
  const timeline = await prisma.weightAnomalyObservation.findMany({
    where: { eventId: event.id },
    orderBy: { recordedAt: "asc" },
  });
  return { event: toPublicWeightAnomaly(event), timeline: timeline.map(toPublicObservation) };
}

export async function acknowledgeWeightAnomaly(actor: ActorContext, eventId: string, body: unknown) {
  const event = await loadAccessibleEvent(actor, eventId);
  if (event.status !== WeightAnomalyStatus.OPEN) {
    throw new HttpError(409, "Only open anomalies can be acknowledged");
  }
  const reason = parseReviewReason(body, false);
  const now = new Date();
  const claimed = await prisma.weightAnomalyEvent.updateMany({
    where: { id: event.id, status: WeightAnomalyStatus.OPEN },
    data: {
      status: WeightAnomalyStatus.ACKNOWLEDGED,
      acknowledgedByUserId: actor.user.id,
      acknowledgedAt: now,
      ...(reason ? { reviewReason: reason } : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new HttpError(409, "This anomaly was updated by another user");
  }
  const updated = await prisma.weightAnomalyEvent.findFirst({
    where: { id: event.id },
    include: eventInclude,
  });
  if (!updated) {
    throw new HttpError(404, "Weight anomaly not found");
  }
  if (event.securityEventId) {
    await prisma.securityEvent.update({
      where: { id: event.securityEventId },
      data: {
        status: SecurityEventStatus.ACKNOWLEDGED,
        acknowledgedByUserId: actor.user.id,
        acknowledgedAt: now,
      },
    });
  }
  await appendReview(event.id, WeightAnomalyTimelineKind.ACKNOWLEDGED, reason, now, event.platformState);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.WEIGHT_ANOMALY_ACKNOWLEDGED,
    entityType: "WeightAnomalyEvent",
    entityId: event.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
  return { event: toPublicWeightAnomaly(updated) };
}

export async function resolveWeightAnomaly(actor: ActorContext, eventId: string, body: unknown) {
  const event = await loadAccessibleEvent(actor, eventId);
  if (event.status === WeightAnomalyStatus.RESOLVED || event.status === WeightAnomalyStatus.FALSE_POSITIVE) {
    throw new HttpError(409, "This anomaly is already closed");
  }
  const reason = parseReviewReason(body, false);
  const now = new Date();
  const claimed = await prisma.weightAnomalyEvent.updateMany({
    where: {
      id: event.id,
      status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] },
    },
    data: {
      status: WeightAnomalyStatus.RESOLVED,
      resolvedByUserId: actor.user.id,
      resolvedAt: now,
      ...(reason ? { reviewReason: reason } : {}),
    },
  });
  if (claimed.count !== 1) {
    throw new HttpError(409, "This anomaly was updated by another user");
  }
  const updated = await prisma.weightAnomalyEvent.findFirst({
    where: { id: event.id },
    include: eventInclude,
  });
  if (!updated) {
    throw new HttpError(404, "Weight anomaly not found");
  }
  if (event.securityEventId) {
    await prisma.securityEvent.update({
      where: { id: event.securityEventId },
      data: { status: SecurityEventStatus.RESOLVED },
    });
  }
  await appendReview(event.id, WeightAnomalyTimelineKind.RESOLVED, reason, now, event.platformState);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.WEIGHT_ANOMALY_RESOLVED,
    entityType: "WeightAnomalyEvent",
    entityId: event.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
  return { event: toPublicWeightAnomaly(updated) };
}

export async function markFalsePositive(actor: ActorContext, eventId: string, body: unknown) {
  const event = await loadAccessibleEvent(actor, eventId);
  if (event.status === WeightAnomalyStatus.FALSE_POSITIVE) {
    throw new HttpError(409, "This anomaly is already marked false positive");
  }
  const reason = parseReviewReason(body, true);
  const now = new Date();
  const claimed = await prisma.weightAnomalyEvent.updateMany({
    where: { id: event.id, status: { not: WeightAnomalyStatus.FALSE_POSITIVE } },
    data: {
      status: WeightAnomalyStatus.FALSE_POSITIVE,
      resolvedByUserId: actor.user.id,
      resolvedAt: now,
      reviewReason: reason,
    },
  });
  if (claimed.count !== 1) {
    throw new HttpError(409, "This anomaly was updated by another user");
  }
  const updated = await prisma.weightAnomalyEvent.findFirst({
    where: { id: event.id },
    include: eventInclude,
  });
  if (!updated) {
    throw new HttpError(404, "Weight anomaly not found");
  }
  if (event.securityEventId) {
    await prisma.securityEvent.update({
      where: { id: event.securityEventId },
      data: { status: SecurityEventStatus.FALSE_POSITIVE },
    });
  }
  await appendReview(event.id, WeightAnomalyTimelineKind.FALSE_POSITIVE, reason, now, event.platformState);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.WEIGHT_ANOMALY_FALSE_POSITIVE,
    entityType: "WeightAnomalyEvent",
    entityId: event.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
  return { event: toPublicWeightAnomaly(updated) };
}

export async function getAnomalyConfig(actor: ActorContext, weighbridgeId: string): Promise<{ config: PublicAnomalyConfig }> {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  const config = await ensureConfig(weighbridge.organizationId, weighbridge.id);
  return { config: toPublicAnomalyConfig(config) };
}

export async function updateAnomalyConfig(actor: ActorContext, weighbridgeId: string, body: unknown) {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  const current = await ensureConfig(weighbridge.organizationId, weighbridge.id);
  const { patch, reason } = parseConfigPatch(body);
  const data: Prisma.WeightAnomalyConfigUpdateInput = {
    updatedByUser: { connect: { id: actor.user.id } },
  };
  if (patch.emptyPlatformThresholdKg !== undefined) {
    data.emptyPlatformThresholdKg = patch.emptyPlatformThresholdKg;
  }
  if (patch.maxChangePerSecondKg !== undefined) {
    data.maxChangePerSecondKg = patch.maxChangePerSecondKg;
  }
  if (patch.weightJumpThresholdKg !== undefined) {
    data.weightJumpThresholdKg = patch.weightJumpThresholdKg;
  }
  if (patch.maxInstabilityDurationMs !== undefined) {
    data.maxInstabilityDurationMs = patch.maxInstabilityDurationMs;
  }
  if (patch.minAnomalyDurationMs !== undefined) {
    data.minAnomalyDurationMs = patch.minAnomalyDurationMs;
  }
  if (patch.consecutiveAnomalyCount !== undefined) {
    data.consecutiveAnomalyCount = patch.consecutiveAnomalyCount;
  }
  if (patch.cooldownMs !== undefined) {
    data.cooldownMs = patch.cooldownMs;
  }
  if (patch.suddenChangeWindowMs !== undefined) {
    data.suddenChangeWindowMs = patch.suddenChangeWindowMs;
  }
  if (patch.suppressAlertsInMaintenance !== undefined) {
    data.suppressAlertsInMaintenance = patch.suppressAlertsInMaintenance;
  }
  const updated = await prisma.weightAnomalyConfig.update({
    where: { id: current.id },
    data,
  });
  invalidateAnomalyCaches(weighbridge.id);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.WEIGHT_ANOMALY_CONFIG_CHANGED,
    entityType: "WeightAnomalyConfig",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { weighbridgeId, oldValue: current, newValue: updated, reason },
  });
  return { config: toPublicAnomalyConfig(updated) };
}

export async function getWeightHealth(actor: ActorContext, weighbridgeId: string): Promise<PublicWeightHealth> {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  const live = getConnectionManager().getSnapshot(weighbridgeId);
  const [maintenance, openTransaction, openCount, lastAnomaly, lastNormal] = await Promise.all([
    prisma.maintenanceEvent.findFirst({
      where: { weighbridgeId, status: MaintenanceStatus.ACTIVE },
      select: { id: true },
    }),
    prisma.transaction.findFirst({
      where: { weighbridgeId, status: { notIn: ["COMPLETED", "CANCELLED", "REJECTED"] } },
      orderBy: { arrivedAt: "desc" },
      select: { status: true },
    }),
    prisma.weightAnomalyEvent.count({
      where: { weighbridgeId, status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] } },
    }),
    prisma.weightAnomalyEvent.findFirst({
      where: { weighbridgeId },
      include: eventInclude,
      orderBy: { lastDetectedAt: "desc" },
    }),
    prisma.weightAnomalyObservation.findFirst({
      where: {
        event: { weighbridgeId },
        kind: { in: [WeightAnomalyTimelineKind.RECOVERED] },
      },
      orderBy: { recordedAt: "desc" },
    }),
  ]);
  const platformState = derivePlatformState({
    hasActiveMaintenance: maintenance !== null,
    openTransactionStatus: openTransaction?.status ?? null,
  });
  const reading = live?.lastReading ?? null;
  const quality = reading?.quality ?? weighbridge.hardwareProfile?.lastQuality ?? null;
  const currentWeight =
    reading && (reading.quality === "STABLE" || reading.quality === "UNSTABLE")
      ? reading.weightKg
      : weighbridge.hardwareProfile?.lastWeightKg?.toString() ?? null;
  const healthStatus =
    maintenance !== null ? "MAINTENANCE" : openCount > 0 && lastAnomaly?.recoveredAt === null ? "ANOMALY" : "NORMAL";
  return {
    weighbridgeId: weighbridge.id,
    weighbridgeCode: weighbridge.code,
    currentWeightKg: currentWeight,
    quality,
    platformState,
    healthStatus,
    lastValidWeightKg: currentWeight,
    lastNormalWeightKg: lastNormal?.weightKg?.toString() ?? (healthStatus === "NORMAL" ? currentWeight : null),
    lastAnomaly: lastAnomaly ? toPublicWeightAnomaly(lastAnomaly) : null,
    openAnomalyCount: openCount,
    deviceStatus: live?.status ?? weighbridge.hardwareProfile?.lastStatus ?? null,
    lastReadingAt: reading?.timestamp ?? weighbridge.hardwareProfile?.lastReadingAt?.toISOString() ?? null,
  };
}

export async function feedAnomalyReadings(
  actor: ActorContext,
  weighbridgeId: string,
  body: unknown,
  platformStateOverride?: WeighbridgePlatformState,
) {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  resetWeightAnomalyRuntime(weighbridgeId);
  const readings = parseFeedBody(body);
  const results = [];
  let clock = Date.now();
  for (const reading of readings) {
    clock = Math.max(Date.now(), clock + 400);
    const timestamp = new Date(reading.timestampMs ?? clock);
    const normalized =
      reading.weightKg === null || reading.quality === "INVALID" || reading.quality === "DEVICE_ERROR"
        ? emptyReading({
            weighbridgeId,
            deviceIdentifier: weighbridge.code,
            providerType: "SIMULATOR",
            source: "SIMULATOR",
            quality: reading.quality,
            connectionStatus: "CONNECTED",
            statusDetail: reading.quality === "INVALID" ? "Simulated invalid reading" : null,
          })
        : readingFromMilliKg({
            milliKg: kgToMilligrams(reading.weightKg.toFixed(3)),
            unit: "KG",
            quality: reading.quality,
            timestamp,
            providerType: "SIMULATOR",
            source: "SIMULATOR",
            deviceIdentifier: weighbridge.code,
            weighbridgeId,
            connectionStatus: "CONNECTED",
          });
    results.push(
      await ingestNormalizedReading({
        weighbridgeId,
        organizationId: weighbridge.organizationId,
        siteId: weighbridge.siteId,
        reading: { ...normalized, timestamp: timestamp.toISOString() },
        nowMs: timestamp.getTime(),
        ...(platformStateOverride ? { platformStateOverride } : {}),
        ...(platformStateOverride === "EMPTY" || platformStateOverride === "MAINTENANCE"
          ? { transactionId: null }
          : {}),
      }),
    );
  }
  return { results };
}

export async function runAnomalyScenario(actor: ActorContext, weighbridgeId: string, body: unknown) {
  const parsed = parseScenarioBody(body);
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  if (parsed.scenario === "MAINTENANCE_ABNORMAL") {
    await startMaintenance(actor, weighbridgeId, { reason: "Simulated maintenance window" });
  }
  const readings = scenarioReadings(parsed.scenario).map((item) => ({
    weightKg: item.weightKg,
    quality: item.quality,
  }));
  const fed = await feedAnomalyReadings(
    actor,
    weighbridge.id,
    { readings },
    scenarioPlatformState(parsed.scenario),
  );
  return { scenario: parsed.scenario, ...fed };
}

function scenarioPlatformState(scenario: WeightAnomalyScenario): WeighbridgePlatformState {
  switch (scenario) {
    case "WEIGHT_JUMP":
    case "REPEATED_INSTABILITY":
      return "WEIGHING";
    case "MAINTENANCE_ABNORMAL":
      return "MAINTENANCE";
    case "NORMAL_EMPTY":
    case "ZERO_DRIFT":
    case "EMPTY_ANOMALY":
    case "NEGATIVE":
    case "INVALID":
    case "RECOVERY":
      return "EMPTY";
    default: {
      const _exhaustive: never = scenario;
      return _exhaustive;
    }
  }
}

export async function startMaintenance(actor: ActorContext, weighbridgeId: string, body: unknown) {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  const reason = parseMaintenanceStart(body);
  const existing = await prisma.maintenanceEvent.findFirst({
    where: { weighbridgeId, status: MaintenanceStatus.ACTIVE },
  });
  if (existing) {
    invalidateAnomalyCaches(weighbridgeId);
    return { maintenance: existing };
  }
  const maintenance = await prisma.maintenanceEvent.create({
    data: {
      organizationId: weighbridge.organizationId,
      siteId: weighbridge.siteId,
      weighbridgeId,
      startedByUserId: actor.user.id,
      startedAt: new Date(),
      reason,
      status: MaintenanceStatus.ACTIVE,
    },
  });
  invalidateAnomalyCaches(weighbridgeId);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.MAINTENANCE_STARTED,
    entityType: "MaintenanceEvent",
    entityId: maintenance.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { weighbridgeId, reason },
  });
  return { maintenance };
}

export async function endMaintenance(actor: ActorContext, weighbridgeId: string, body: unknown) {
  await getAccessibleWeighbridge(actor, weighbridgeId);
  const notes = parseReviewReason(body, false);
  const existing = await prisma.maintenanceEvent.findFirst({
    where: { weighbridgeId, status: MaintenanceStatus.ACTIVE },
  });
  if (!existing) {
    throw new HttpError(409, "Weighbridge is not in maintenance");
  }
  const maintenance = await prisma.maintenanceEvent.update({
    where: { id: existing.id },
    data: {
      status: MaintenanceStatus.COMPLETED,
      endedAt: new Date(),
      endedByUserId: actor.user.id,
      ...(notes ? { notes } : {}),
    },
  });
  invalidateAnomalyCaches(weighbridgeId);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.MAINTENANCE_ENDED,
    entityType: "MaintenanceEvent",
    entityId: maintenance.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { weighbridgeId, notes },
  });
  return { maintenance };
}

export async function dashboardAnomalySummary(actor: ActorContext, filters: { siteId?: string; weighbridgeId?: string }) {
  await assertRequestedScope(actor, filters);
  const siteIds = accessibleSiteIds(actor);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const where: Prisma.WeightAnomalyEventWhereInput = {
    organizationId: actor.user.organizationId,
    ...(siteIds ? { siteId: { in: siteIds } } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.weighbridgeId ? { weighbridgeId: filters.weighbridgeId } : {}),
  };
  const [open, today, critical, repeated, recovered, items] = await Promise.all([
    prisma.weightAnomalyEvent.count({
      where: { ...where, status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] } },
    }),
    prisma.weightAnomalyEvent.count({ where: { ...where, firstDetectedAt: { gte: todayStart } } }),
    prisma.weightAnomalyEvent.count({
      where: { ...where, severity: "CRITICAL", status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] } },
    }),
    prisma.weightAnomalyEvent.count({ where: { ...where, occurrenceCount: { gte: 3 } } }),
    prisma.weightAnomalyEvent.count({ where: { ...where, recoveredAt: { not: null } } }),
    prisma.weightAnomalyEvent.findMany({
      where: { ...where, status: { in: [WeightAnomalyStatus.OPEN, WeightAnomalyStatus.ACKNOWLEDGED] } },
      include: eventInclude,
      orderBy: { lastDetectedAt: "desc" },
      take: 8,
    }),
  ]);
  return {
    open,
    today,
    critical,
    repeated,
    recovered,
    items: items.map(toPublicWeightAnomaly),
  };
}

async function ensureConfig(organizationId: string, weighbridgeId: string) {
  const existing = await prisma.weightAnomalyConfig.findUnique({ where: { weighbridgeId } });
  if (existing) {
    return existing;
  }
  return prisma.weightAnomalyConfig.create({
    data: {
      organizationId,
      weighbridgeId,
      emptyPlatformThresholdKg: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.emptyPlatformThresholdKg,
      maxChangePerSecondKg: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.maxChangePerSecondKg,
      weightJumpThresholdKg: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.weightJumpThresholdKg,
      maxInstabilityDurationMs: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.maxInstabilityDurationMs,
      minAnomalyDurationMs: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.minAnomalyDurationMs,
      consecutiveAnomalyCount: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.consecutiveAnomalyCount,
      cooldownMs: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.cooldownMs,
      suddenChangeWindowMs: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.suddenChangeWindowMs,
      suppressAlertsInMaintenance: DEVELOPMENT_DEFAULT_ANOMALY_CONFIG.suppressAlertsInMaintenance,
      defaultsLabel: DEVELOPMENT_DEFAULT_LABEL,
    },
  });
}

async function loadAccessibleEvent(actor: ActorContext, eventId: string) {
  const event = await prisma.weightAnomalyEvent.findFirst({
    where: { id: eventId, organizationId: actor.user.organizationId },
    include: eventInclude,
  });
  if (!event) {
    throw new HttpError(404, "Weight anomaly not found");
  }
  const siteIds = accessibleSiteIds(actor);
  if (siteIds && !siteIds.includes(event.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  return event;
}

function anomalyWhere(
  actor: ActorContext,
  filters: ReturnType<typeof parseAnomalyListQuery>,
): Prisma.WeightAnomalyEventWhereInput {
  const siteIds = accessibleSiteIds(actor);
  return {
    organizationId: actor.user.organizationId,
    ...(siteIds ? { siteId: { in: siteIds } } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.weighbridgeId ? { weighbridgeId: filters.weighbridgeId } : {}),
    ...(filters.type ? { type: filters.type as never } : {}),
    ...(filters.severity ? { severity: filters.severity as never } : {}),
    ...(filters.status ? { status: filters.status as never } : {}),
    ...(filters.from || filters.to
      ? {
          firstDetectedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

async function appendReview(
  eventId: string,
  kind: WeightAnomalyTimelineKind,
  reason: string | null,
  now: Date,
  platformState: string,
): Promise<void> {
  await prisma.weightAnomalyObservation.create({
    data: {
      eventId,
      recordedAt: now,
      kind,
      platformState,
      ...(reason ? { note: reason } : {}),
    },
  });
}
