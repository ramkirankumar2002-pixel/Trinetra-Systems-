import { EdgeSyncConflictStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicConflict, toPublicDeadLetter, toPublicSnapshot } from "./mapper.js";
import type { PublicDeadLetter, PublicSyncConflict, PublicSyncSnapshot } from "./types.js";

export async function listSyncDashboard(
  actor: ActorContext,
): Promise<{ items: PublicSyncSnapshot[] }> {
  const gateways = await prisma.edgeGateway.findMany({
    where: { organizationId: actor.user.organizationId },
    include: { site: { select: { id: true, code: true, name: true } }, syncSnapshot: true },
    orderBy: { code: "asc" },
  });
  const items: PublicSyncSnapshot[] = [];
  for (const gateway of gateways) {
    if (!canAccessSite(actor.user, gateway.siteId)) {
      continue;
    }
    const openConflicts = await prisma.edgeSyncConflict.count({
      where: { gatewayId: gateway.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    });
    if (gateway.syncSnapshot) {
      items.push(toPublicSnapshot(gateway.syncSnapshot, gateway, gateway.site, openConflicts));
      continue;
    }
    items.push({
      gatewayId: gateway.id,
      gatewayCode: gateway.code,
      gatewayName: gateway.name,
      site: gateway.site,
      connectivityState: gateway.status === "ONLINE" ? "ONLINE" : "OFFLINE",
      internetStatus: gateway.lastHeartbeatAt ? "ONLINE" : "OFFLINE",
      backendStatus: gateway.status === "ONLINE" ? "REACHABLE" : "UNREACHABLE",
      hardwareStatus: gateway.connectedDeviceCount > 0 ? "ONLINE" : "OFFLINE",
      syncStatus: "IDLE",
      queued: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      deadLetter: 0,
      lastSuccessfulSyncAt: gateway.lastCommunicationAt?.toISOString() ?? null,
      nextRetryAt: null,
      lastError: gateway.lastError,
      lastHeartbeatAt: gateway.lastHeartbeatAt?.toISOString() ?? null,
      storageUsedBytes: 0,
      storageLimitBytes: 524288000,
      configVersion: null,
      configCachedAt: null,
      configStale: false,
      openConflicts,
    });
  }
  return { items };
}

export async function listSyncConflicts(
  actor: ActorContext,
): Promise<{ items: PublicSyncConflict[] }> {
  const rows = await prisma.edgeSyncConflict.findMany({
    where: { organizationId: actor.user.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return {
    items: rows.filter((row) => canAccessSite(actor.user, row.siteId)).map(toPublicConflict),
  };
}

export async function listDeadLetters(
  actor: ActorContext,
): Promise<{ items: PublicDeadLetter[] }> {
  const rows = await prisma.edgeDeadLetter.findMany({
    where: { organizationId: actor.user.organizationId },
    orderBy: { lastFailureAt: "desc" },
    take: 100,
  });
  return {
    items: rows.filter((row) => canAccessSite(actor.user, row.siteId)).map(toPublicDeadLetter),
  };
}

export async function acknowledgeConflict(
  actor: ActorContext,
  conflictId: string,
): Promise<PublicSyncConflict> {
  const conflict = await loadConflict(actor, conflictId);
  const updated = await prisma.edgeSyncConflict.update({
    where: { id: conflict.id },
    data: {
      status: EdgeSyncConflictStatus.ACKNOWLEDGED,
      acknowledgedByUserId: actor.user.id,
      acknowledgedAt: new Date(),
    },
  });
  return toPublicConflict(updated);
}

export async function resolveConflict(
  actor: ActorContext,
  conflictId: string,
  note: string,
): Promise<PublicSyncConflict> {
  const conflict = await loadConflict(actor, conflictId);
  const updated = await prisma.edgeSyncConflict.update({
    where: { id: conflict.id },
    data: {
      status: EdgeSyncConflictStatus.RESOLVED,
      resolvedByUserId: actor.user.id,
      resolvedAt: new Date(),
      resolutionNote: note,
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.EDGE_SYNC_CONFLICT_RESOLVED,
    entityType: "EdgeSyncConflict",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { note, localState: updated.localState, centralState: updated.centralState },
  });
  return toPublicConflict(updated);
}

async function loadConflict(actor: ActorContext, conflictId: string) {
  const conflict = await prisma.edgeSyncConflict.findFirst({
    where: { id: conflictId, organizationId: actor.user.organizationId },
  });
  if (!conflict) {
    throw new HttpError(404, "Synchronization conflict not found");
  }
  if (!canAccessSite(actor.user, conflict.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  return conflict;
}
