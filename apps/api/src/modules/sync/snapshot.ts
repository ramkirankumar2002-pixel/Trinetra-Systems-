import { EdgeConnectivityState, Prisma } from "@prisma/client";
import { isConnectivityState } from "../../domain/connectivityState.js";
import { prisma } from "../../db/client.js";
import { emitStorageLimitAlert } from "./alerts.js";
import type { SyncSnapshotInput } from "./validators.js";

export async function persistSyncSnapshot(
  gateway: { id: string; organizationId: string; siteId: string; code: string },
  snapshot: SyncSnapshotInput,
): Promise<void> {
  const connectivityState = isConnectivityState(snapshot.connectivityState)
    ? (snapshot.connectivityState as EdgeConnectivityState)
    : EdgeConnectivityState.DEGRADED;

  await prisma.edgeSyncSnapshot.upsert({
    where: { gatewayId: gateway.id },
    update: {
      connectivityState,
      internetStatus: snapshot.internetStatus,
      backendStatus: snapshot.backendStatus,
      hardwareStatus: snapshot.hardwareStatus,
      syncStatus: snapshot.syncStatus,
      queued: snapshot.queued,
      syncing: snapshot.syncing,
      synced: snapshot.synced,
      failed: snapshot.failed,
      deadLetter: snapshot.deadLetter,
      lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt ? new Date(snapshot.lastSuccessfulSyncAt) : null,
      nextRetryAt: snapshot.nextRetryAt ? new Date(snapshot.nextRetryAt) : null,
      lastError: snapshot.lastError,
      storageUsedBytes: snapshot.storageUsedBytes,
      storageLimitBytes: snapshot.storageLimitBytes,
      configVersion: snapshot.configVersion,
      configCachedAt: snapshot.configCachedAt ? new Date(snapshot.configCachedAt) : null,
      configStale: snapshot.configStale,
    },
    create: {
      gatewayId: gateway.id,
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      connectivityState,
      internetStatus: snapshot.internetStatus,
      backendStatus: snapshot.backendStatus,
      hardwareStatus: snapshot.hardwareStatus,
      syncStatus: snapshot.syncStatus,
      queued: snapshot.queued,
      syncing: snapshot.syncing,
      synced: snapshot.synced,
      failed: snapshot.failed,
      deadLetter: snapshot.deadLetter,
      lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt ? new Date(snapshot.lastSuccessfulSyncAt) : null,
      nextRetryAt: snapshot.nextRetryAt ? new Date(snapshot.nextRetryAt) : null,
      lastError: snapshot.lastError,
      storageUsedBytes: snapshot.storageUsedBytes,
      storageLimitBytes: snapshot.storageLimitBytes,
      configVersion: snapshot.configVersion,
      configCachedAt: snapshot.configCachedAt ? new Date(snapshot.configCachedAt) : null,
      configStale: snapshot.configStale,
    },
  });

  if (snapshot.storageLimitBytes > 0 && snapshot.storageUsedBytes >= snapshot.storageLimitBytes * 0.85) {
    emitStorageLimitAlert({
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      gatewayCode: gateway.code,
    });
  }
}

export async function recordDeadLetter(
  gateway: { id: string; organizationId: string; siteId: string; code: string },
  input: {
    eventId: string;
    eventType: string;
    error: string;
    retryCount: number;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date();
  await prisma.edgeDeadLetter.upsert({
    where: { eventId: input.eventId },
    update: {
      error: input.error,
      retryCount: input.retryCount,
      lastFailureAt: now,
      payloadRef: input.payload as Prisma.InputJsonValue,
    },
    create: {
      eventId: input.eventId,
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      eventType: input.eventType,
      error: input.error,
      retryCount: input.retryCount,
      firstFailureAt: now,
      lastFailureAt: now,
      payloadRef: input.payload as Prisma.InputJsonValue,
      recommendedAction: "Inspect the payload and correct the permanent error. The business event was not deleted.",
    },
  });
}
