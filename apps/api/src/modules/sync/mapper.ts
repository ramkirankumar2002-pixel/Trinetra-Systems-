import type { EdgeDeadLetter, EdgeGateway, EdgeSyncConflict, EdgeSyncSnapshot, Site } from "@prisma/client";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { env } from "../../config/env.js";
import type { PublicDeadLetter, PublicSyncConflict, PublicSyncSnapshot } from "./types.js";

export function toPublicSnapshot(
  snapshot: EdgeSyncSnapshot,
  gateway: Pick<EdgeGateway, "id" | "code" | "name" | "lastHeartbeatAt" | "enabled" | "revokedAt">,
  site: Pick<Site, "id" | "code" | "name">,
  openConflicts: number,
  nowMs = Date.now(),
): PublicSyncSnapshot {
  const derived = deriveGatewayRuntimeStatus({
    enabled: gateway.enabled,
    revokedAt: gateway.revokedAt,
    lastHeartbeatAt: gateway.lastHeartbeatAt,
    nowMs,
    offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
  });
  return {
    gatewayId: gateway.id,
    gatewayCode: gateway.code,
    gatewayName: gateway.name,
    site: { id: site.id, code: site.code, name: site.name },
    connectivityState: snapshot.connectivityState,
    internetStatus: snapshot.internetStatus,
    backendStatus: derived === "OFFLINE" ? "UNREACHABLE" : snapshot.backendStatus,
    hardwareStatus: snapshot.hardwareStatus,
    syncStatus: snapshot.syncStatus,
    queued: snapshot.queued,
    syncing: snapshot.syncing,
    synced: snapshot.synced,
    failed: snapshot.failed,
    deadLetter: snapshot.deadLetter,
    lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt?.toISOString() ?? null,
    nextRetryAt: snapshot.nextRetryAt?.toISOString() ?? null,
    lastError: snapshot.lastError,
    lastHeartbeatAt: gateway.lastHeartbeatAt?.toISOString() ?? null,
    storageUsedBytes: snapshot.storageUsedBytes,
    storageLimitBytes: snapshot.storageLimitBytes,
    configVersion: snapshot.configVersion,
    configCachedAt: snapshot.configCachedAt?.toISOString() ?? null,
    configStale: snapshot.configStale,
    openConflicts,
  };
}

export function toPublicConflict(row: EdgeSyncConflict): PublicSyncConflict {
  return {
    id: row.id,
    eventId: row.eventId,
    gatewayId: row.gatewayId,
    localTransactionId: row.localTransactionId,
    transactionId: row.transactionId,
    localState: row.localState,
    centralState: row.centralState,
    reason: row.reason,
    recommendedAction: row.recommendedAction,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolutionNote: row.resolutionNote,
  };
}

export function toPublicDeadLetter(row: EdgeDeadLetter): PublicDeadLetter {
  return {
    eventId: row.eventId,
    gatewayId: row.gatewayId,
    eventType: row.eventType,
    error: row.error,
    retryCount: row.retryCount,
    firstFailureAt: row.firstFailureAt.toISOString(),
    lastFailureAt: row.lastFailureAt.toISOString(),
    recommendedAction: row.recommendedAction,
  };
}
