import {
  ApprovalDecision,
  DocumentStatus,
  OcrStatus,
  Prisma,
  TransactionStatus,
  UnloadingStatus,
} from "@prisma/client";
import { env, isProduction, simulationFlags } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { communicationFromHardwareStatus } from "../../domain/observability/deviceMonitor.js";
import { overlayGatewayMonitorStatus } from "../../domain/observability/gatewayMonitor.js";
import { classifyProviderMonitorStatus } from "../../domain/observability/providerMonitor.js";
import { MONITORING_ALERT_TYPES } from "../../domain/observability/incidents.js";
import { isOperationalAlertStatus } from "../../domain/notificationCatalog.js";
import { parsePagination } from "../../domain/pagination.js";
import { classifyGatewayLiveness } from "../../domain/reliability/stale.js";
import { HttpError } from "../../lib/httpError.js";
import { metrics } from "../../lib/metrics.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, assertRequestedSite } from "../shared/siteScope.js";
import { collectDependencyHealth } from "../reliability/health.js";
import { listStaleTransactions } from "../reliability/service.js";
import { toPublicSnapshot } from "../sync/mapper.js";
import {
  toPublicIncident,
  type PublicMonitorDevice,
  type PublicMonitorGateway,
  type PublicMonitorIncident,
  type PublicMonitorProvider,
} from "./mapper.js";

const IN_PROGRESS_STATUSES: TransactionStatus[] = [
  TransactionStatus.ARRIVED,
  TransactionStatus.IDENTIFIED,
  TransactionStatus.DOCUMENT_PENDING,
  TransactionStatus.DOCUMENT_VERIFIED,
  TransactionStatus.MATERIAL_CLASSIFIED,
  TransactionStatus.FIRST_WEIGHMENT,
  TransactionStatus.PENDING_APPROVAL,
  TransactionStatus.APPROVED,
  TransactionStatus.UNLOADING,
  TransactionStatus.UNLOADED,
  TransactionStatus.SECOND_WEIGHMENT,
  TransactionStatus.ON_HOLD,
];

export async function getMonitoringStatus(actor: ActorContext) {
  const [health, gateways, sync, metricsSnapshot, openIncidents, staleTransactions] = await Promise.all([
    collectDependencyHealth(),
    listMonitorGateways(actor),
    listMonitorSync(actor),
    getOperationalMetrics(actor),
    listMonitorIncidents(actor, { page: 1, pageSize: 8 }, { openOnly: true }),
    listStaleTransactions(actor),
  ]);

  const flags = simulationFlags();
  return {
    systemStatus: overallFromHealth(health),
    services: health.filter((item) =>
      ["backend", "postgresql", "edgeGateway", "offlineSync", "notifications", "weighbridge", "anpr", "ocr"].includes(item.name),
    ),
    providers: providersFromHealth(health),
    operational: metricsSnapshot.operational,
    currentIssues: {
      openAlerts: openIncidents.total,
      offlineGateways: gateways.filter((item) => item.monitorStatus === "OFFLINE" || item.monitorStatus === "STALE").length,
      failedSynchronization: sync.reduce((sum, item) => sum + item.failed + item.deadLetter, 0),
      staleTransactions: staleTransactions.length,
      providerFailures: health.filter((item) =>
        ["weighbridge", "anpr", "ocr", "voice"].includes(item.name) &&
        (item.status === "UNAVAILABLE" || item.status === "DEGRADED"),
      ).length,
    },
    incidents: openIncidents.items,
    development: isProduction()
      ? null
      : {
          environment: env.nodeEnv,
          simulationMode: true,
          flags,
          simulators: {
            gateway: true,
            anpr: true,
            weighbridge: true,
            ocr: true,
            voice: env.driverVoiceEnabled,
            sync: true,
          },
        },
    refreshIntervalMs: 45_000,
    metricsLimitation: "In-memory metrics are not sufficient for production long-term historical monitoring.",
  };
}

export async function getMonitoringHealth() {
  const dependencies = await collectDependencyHealth();
  const migration = await detectMigrationStatus();
  return {
    dependencies,
    migration,
    metricsStorage: "memory" as const,
    limitation: "In-memory metrics are not sufficient for production long-term historical monitoring.",
  };
}

export async function listMonitorGateways(actor: ActorContext): Promise<PublicMonitorGateway[]> {
  const siteIds = accessibleSiteIds(actor);
  const rows = await prisma.edgeGateway.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
    include: {
      site: { select: { id: true, code: true, name: true } },
      devices: { select: { enabled: true, status: true } },
      syncSnapshot: {
        select: { queued: true, failed: true, deadLetter: true, syncStatus: true },
      },
    },
    orderBy: { code: "asc" },
  });
  const nowMs = Date.now();
  return rows.map((row) => {
    const runtime = deriveGatewayRuntimeStatus({
      enabled: row.enabled,
      revokedAt: row.revokedAt,
      lastHeartbeatAt: row.lastHeartbeatAt,
      nowMs,
      offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
    });
    const liveness = classifyGatewayLiveness({
      lastHeartbeatAt: row.lastHeartbeatAt,
      nowMs,
      staleAfterMs: env.gatewayStaleAfterMs,
      offlineAfterMs: env.gatewayOfflineTimeoutMs,
      enabled: row.enabled,
      revokedAt: row.revokedAt,
    });
    const unhealthyDeviceCount = row.devices.filter((device) => device.enabled && device.status === "ERROR").length;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      site: row.site,
      monitorStatus: overlayGatewayMonitorStatus({
        runtime,
        liveness,
        lastError: row.lastError,
        unhealthyDeviceCount,
      }),
      runtimeStatus: runtime,
      lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
      connectedDevices: row.devices.filter((device) => device.enabled && device.status === "CONNECTED").length,
      pendingEvents: row.syncSnapshot?.queued ?? 0,
      failedEvents: row.syncSnapshot?.failed ?? 0,
      deadLetterEvents: row.syncSnapshot?.deadLetter ?? 0,
      syncStatus: row.syncSnapshot?.syncStatus ?? null,
      softwareVersion: row.softwareVersion,
      lastError: row.lastError,
    };
  });
}

export async function listMonitorDevices(actor: ActorContext): Promise<PublicMonitorDevice[]> {
  const siteIds = accessibleSiteIds(actor);
  const siteFilter = siteIds ? { siteId: { in: siteIds } } : {};
  const [edgeDevices, hardware, cameras] = await Promise.all([
    prisma.edgeDevice.findMany({
      where: { organizationId: actor.user.organizationId, ...siteFilter },
      include: { gateway: { select: { id: true, code: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.weighbridgeHardwareProfile.findMany({
      where: { organizationId: actor.user.organizationId, ...siteFilter },
      include: { weighbridge: { select: { code: true, name: true } } },
    }),
    prisma.camera.findMany({
      where: { organizationId: actor.user.organizationId, ...siteFilter },
      select: {
        id: true,
        name: true,
        enabled: true,
        lastStatus: true,
        lastCommunicationAt: true,
        lastError: true,
        cameraProviderType: true,
      },
    }),
  ]);

  const linkedWeighbridges = new Set(edgeDevices.map((item) => item.weighbridgeId).filter((id): id is string => id !== null));
  const linkedCameras = new Set(edgeDevices.map((item) => item.cameraId).filter((id): id is string => id !== null));

  const devices: PublicMonitorDevice[] = edgeDevices.map((row) => ({
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    source: "EDGE",
    gatewayId: row.gateway.id,
    gatewayCode: row.gateway.code,
    communication: communicationFromHardwareStatus(row.status, row.enabled),
    lastCommunicationAt: row.lastCommunicationAt?.toISOString() ?? null,
    errorState: row.lastError,
    simulated: row.provider === "SIMULATOR" || row.protocolReadiness === "SIMULATOR",
  }));

  for (const profile of hardware) {
    if (linkedWeighbridges.has(profile.weighbridgeId)) {
      continue;
    }
    devices.push({
      id: profile.id,
      name: profile.deviceName,
      deviceType: "WEIGHBRIDGE_INDICATOR",
      source: "WEIGHBRIDGE",
      gatewayId: null,
      gatewayCode: null,
      communication: communicationFromHardwareStatus(profile.lastStatus, profile.enabled),
      lastCommunicationAt: profile.lastReadingAt?.toISOString() ?? profile.lastConnectedAt?.toISOString() ?? null,
      errorState: profile.lastError,
      simulated: profile.providerType === "SIMULATOR",
    });
  }

  for (const camera of cameras) {
    if (linkedCameras.has(camera.id)) {
      continue;
    }
    devices.push({
      id: camera.id,
      name: camera.name,
      deviceType: "CAMERA",
      source: "CAMERA",
      gatewayId: null,
      gatewayCode: null,
      communication: communicationFromHardwareStatus(camera.lastStatus, camera.enabled),
      lastCommunicationAt: camera.lastCommunicationAt?.toISOString() ?? null,
      errorState: camera.lastError,
      simulated: camera.cameraProviderType === "SIMULATOR",
    });
  }

  return devices;
}

export async function listMonitorSync(actor: ActorContext) {
  const siteIds = accessibleSiteIds(actor);
  const snapshots = await prisma.edgeSyncSnapshot.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(siteIds ? { gateway: { siteId: { in: siteIds } } } : {}),
    },
    include: {
      gateway: {
        select: {
          id: true,
          code: true,
          name: true,
          lastHeartbeatAt: true,
          enabled: true,
          revokedAt: true,
          site: { select: { id: true, code: true, name: true } },
        },
      },
    },
  });
  const conflictCounts = await prisma.edgeSyncConflict.groupBy({
    by: ["gatewayId"],
    where: {
      organizationId: actor.user.organizationId,
      status: "OPEN",
    },
    _count: { _all: true },
  });
  const conflictMap = new Map(conflictCounts.map((row) => [row.gatewayId, row._count._all]));
  return snapshots.map((snapshot) =>
    toPublicSnapshot(snapshot, snapshot.gateway, snapshot.gateway.site, conflictMap.get(snapshot.gatewayId) ?? 0),
  );
}

export async function getOperationalMetrics(actor: ActorContext) {
  const siteIds = accessibleSiteIds(actor);
  const orgId = actor.user.organizationId;
  const siteWhere = siteIds ? { siteId: { in: siteIds } } : {};
  const now = Date.now();

  const [
    created,
    completed,
    inProgress,
    exceptions,
    pendingApprovals,
    approved,
    rejected,
    pendingUnloading,
    activeUnloading,
    completedUnloading,
    documentsUploaded,
    documentsReview,
    ocrFailed,
    openSecurity,
    openAnomalies,
    offlineGateways,
    syncTotals,
    activeSessions,
    completedSample,
    approvalSample,
  ] = await Promise.all([
    prisma.transaction.count({ where: { organizationId: orgId, ...siteWhere } }),
    prisma.transaction.count({ where: { organizationId: orgId, ...siteWhere, status: TransactionStatus.COMPLETED } }),
    prisma.transaction.count({ where: { organizationId: orgId, ...siteWhere, status: { in: IN_PROGRESS_STATUSES } } }),
    prisma.transaction.count({ where: { organizationId: orgId, ...siteWhere, status: TransactionStatus.EXCEPTION } }),
    prisma.approval.count({
      where: { organizationId: orgId, ...siteWhere, decision: ApprovalDecision.PENDING },
    }),
    prisma.approval.count({
      where: { organizationId: orgId, ...siteWhere, decision: ApprovalDecision.APPROVED },
    }),
    prisma.approval.count({
      where: { organizationId: orgId, ...siteWhere, decision: ApprovalDecision.REJECTED },
    }),
    prisma.unloading.count({
      where: {
        status: UnloadingStatus.NOT_STARTED,
        transaction: { organizationId: orgId, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      },
    }),
    prisma.unloading.count({
      where: {
        status: UnloadingStatus.IN_PROGRESS,
        transaction: { organizationId: orgId, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      },
    }),
    prisma.unloading.count({
      where: {
        status: UnloadingStatus.COMPLETED,
        transaction: { organizationId: orgId, ...(siteIds ? { siteId: { in: siteIds } } : {}) },
      },
    }),
    prisma.document.count({
      where: { organizationId: orgId, ...(siteIds ? { transaction: { siteId: { in: siteIds } } } : {}) },
    }),
    prisma.document.count({
      where: {
        organizationId: orgId,
        status: { in: [DocumentStatus.UPLOADED, DocumentStatus.PROCESSING, DocumentStatus.EXTRACTED] },
        ...(siteIds ? { transaction: { siteId: { in: siteIds } } } : {}),
      },
    }),
    prisma.document.count({
      where: {
        organizationId: orgId,
        ocrStatus: OcrStatus.FAILED,
        ...(siteIds ? { transaction: { siteId: { in: siteIds } } } : {}),
      },
    }),
    prisma.securityEvent.count({
      where: { organizationId: orgId, ...siteWhere, status: "OPEN" },
    }),
    prisma.weightAnomalyEvent.count({
      where: { organizationId: orgId, ...siteWhere, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    }),
    prisma.edgeGateway.count({
      where: {
        organizationId: orgId,
        ...(siteIds ? { siteId: { in: siteIds } } : {}),
        enabled: true,
        revokedAt: null,
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: new Date(now - env.gatewayOfflineTimeoutMs) } }],
      },
    }),
    prisma.edgeSyncSnapshot.aggregate({
      where: { organizationId: orgId, ...(siteIds ? { gateway: { siteId: { in: siteIds } } } : {}) },
      _sum: { queued: true, failed: true, deadLetter: true, syncing: true, synced: true },
    }),
    prisma.refreshToken.count({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { organizationId: orgId } },
    }),
    prisma.transaction.findMany({
      where: { organizationId: orgId, ...siteWhere, status: TransactionStatus.COMPLETED, completedAt: { not: null } },
      select: { arrivedAt: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 200,
    }),
    prisma.approval.findMany({
      where: {
        organizationId: orgId,
        ...siteWhere,
        decision: { in: [ApprovalDecision.APPROVED, ApprovalDecision.REJECTED] },
        decidedAt: { not: null },
      },
      select: { requestedAt: true, decidedAt: true },
      orderBy: { decidedAt: "desc" },
      take: 200,
    }),
  ]);

  const processStart = metrics.snapshot();
  const window = metrics.windowStats(now, env.slowRequestMs);
  const staleUnloading = await countStaleUnloading(actor);

  return {
    storage: "memory" as const,
    limitation: "In-memory metrics are not sufficient for production long-term historical monitoring.",
    process: processStart,
    window: {
      apiRequests: window.requests,
      apiErrors: window.errors,
      slowRequests: window.slow,
      errorRate: window.requests === 0 ? 0 : window.errors / window.requests,
    },
    operational: {
      apiRequests: window.requests,
      apiErrors: window.errors,
      apiLatencyMs: averageDuration(processStart.histograms, "api_request_duration_ms"),
      activeSessions,
      backendHealth: "AVAILABLE",
      transactionsCreated: created,
      transactionsCompleted: completed,
      transactionsInProgress: inProgress,
      transactionsWithExceptions: exceptions,
      averageTransactionProcessingMs: averageElapsed(completedSample.map((row) => ({
        start: row.arrivedAt,
        end: row.completedAt,
      }))),
      documentsUploaded,
      ocrProcessingRequests: documentsUploaded,
      ocrFailures: ocrFailed,
      documentsAwaitingReview: documentsReview,
      pendingApprovals,
      approved,
      rejected,
      averageApprovalMs: averageElapsed(approvalSample.map((row) => ({
        start: row.requestedAt,
        end: row.decidedAt,
      }))),
      pendingUnloading,
      activeUnloading,
      completedUnloading,
      staleUnloading,
      offlineGateways,
      pendingSyncEvents: syncTotals._sum.queued ?? 0,
      failedSyncEvents: syncTotals._sum.failed ?? 0,
      deadLetterEvents: syncTotals._sum.deadLetter ?? 0,
      openSecurityEvents: openSecurity,
      weightAnomalies: openAnomalies,
      authenticationFailures: counterValue(processStart.counters, "authentication_failures_total"),
      authorizationFailures: counterValue(processStart.counters, "authorization_failures_total"),
      weighbridgeReadings: counterValue(processStart.counters, "weighbridge_readings_total"),
      unstableReadings: counterValue(processStart.counters, "weighbridge_unstable_readings_total"),
      weighmentFailures: counterValue(processStart.counters, "weighbridge_provider_failures_total"),
    },
  };
}

export async function listMonitorIncidents(
  actor: ActorContext,
  query: { page?: unknown; pageSize?: unknown; status?: unknown },
  options: { openOnly?: boolean } = {},
): Promise<{ items: PublicMonitorIncident[]; page: number; pageSize: number; total: number }> {
  const pagination = parsePagination(query, { pageSize: 20, maxPageSize: 50 });
  const siteIds = accessibleSiteIds(actor);
  const status = typeof query.status === "string" && query.status !== "" ? query.status : undefined;
  if (status && !isOperationalAlertStatus(status)) {
    throw new HttpError(400, "status is invalid");
  }
  const where: Prisma.OperationalAlertWhereInput = {
    organizationId: actor.user.organizationId,
    type: { in: [...MONITORING_ALERT_TYPES] },
  };
  if (status && isOperationalAlertStatus(status)) {
    where.status = status;
  } else if (options.openOnly) {
    where.status = { in: ["OPEN", "ACKNOWLEDGED"] };
  }
  if (siteIds) {
    where.siteId = { in: siteIds };
  }
  const [total, rows] = await Promise.all([
    prisma.operationalAlert.count({ where }),
    prisma.operationalAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true,
        type: true,
        title: true,
        severity: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        entityType: true,
        entityId: true,
        transactionId: true,
        eventKey: true,
      },
    }),
  ]);
  return {
    items: rows.map(toPublicIncident),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function listMonitorHistory(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicMonitorIncident[]; page: number; pageSize: number; total: number }> {
  if (typeof query.siteId === "string" && query.siteId !== "") {
    await assertRequestedSite(actor, query.siteId);
  }
  return listMonitorIncidents(actor, query);
}

export function providersFromHealth(
  health: Awaited<ReturnType<typeof collectDependencyHealth>>,
): PublicMonitorProvider[] {
  const flags = simulationFlags();
  return ["weighbridge", "anpr", "ocr", "voice"].map((name) => {
    const item = health.find((entry) => entry.name === name);
    const status = item?.status ?? classifyProviderMonitorStatus({
      configured: true,
      reachable: !flags.providerUnavailable,
      simulation: name !== "voice" || env.driverVoiceEnabled,
      disabled: name === "voice" && !env.driverVoiceEnabled,
    });
    return {
      name,
      status,
      simulated: item?.simulated ?? true,
      detail: item?.detail ?? "Provider abstraction",
    };
  });
}

async function detectMigrationStatus(): Promise<{ status: "APPLIED" | "UNKNOWN"; latest: string | null }> {
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY finished_at DESC NULLS LAST
      LIMIT 1
    `;
    const latest = rows[0];
    if (!latest) {
      return { status: "UNKNOWN", latest: null };
    }
    return {
      status: latest.finished_at && !latest.rolled_back_at ? "APPLIED" : "UNKNOWN",
      latest: latest.migration_name,
    };
  } catch {
    return { status: "UNKNOWN", latest: null };
  }
}

async function countStaleUnloading(actor: ActorContext): Promise<number> {
  const siteIds = accessibleSiteIds(actor);
  const rows = await prisma.unloading.findMany({
    where: {
      status: UnloadingStatus.IN_PROGRESS,
      transaction: {
        organizationId: actor.user.organizationId,
        ...(siteIds ? { siteId: { in: siteIds } } : {}),
      },
    },
    select: { updatedAt: true },
    take: 200,
  });
  const cutoff = Date.now() - env.staleUnloadingHours * 60 * 60 * 1000;
  return rows.filter((row) => row.updatedAt.getTime() < cutoff).length;
}

function overallFromHealth(health: Awaited<ReturnType<typeof collectDependencyHealth>>): "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" {
  if (health.some((item) => item.name === "postgresql" && item.status === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (health.some((item) => item.status === "UNAVAILABLE" || item.status === "DEGRADED")) {
    return "DEGRADED";
  }
  return "AVAILABLE";
}

function averageElapsed(rows: Array<{ start: Date; end: Date | null }>): number | null {
  const durations = rows
    .map((row) => (row.end ? row.end.getTime() - row.start.getTime() : null))
    .filter((value): value is number => value !== null && value >= 0);
  if (durations.length === 0) {
    return null;
  }
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function averageDuration(
  histograms: Array<{ name: string; count: number; sum: number }>,
  name: string,
): number | null {
  const matches = histograms.filter((item) => item.name === name);
  const count = matches.reduce((sum, item) => sum + item.count, 0);
  const sum = matches.reduce((total, item) => total + item.sum, 0);
  if (count === 0) {
    return null;
  }
  return Math.round(sum / count);
}

function counterValue(counters: Array<{ name: string; value: number }>, name: string): number {
  return counters.filter((item) => item.name === name).reduce((sum, item) => sum + item.value, 0);
}
