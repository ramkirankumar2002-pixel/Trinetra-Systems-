import { BackupRunStatus } from "@prisma/client";
import { dayBucket } from "../../domain/reliability/stale.js";
import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import { prisma } from "../../db/client.js";
import { writeLog } from "../../lib/logger.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { emitGatewayOffline } from "../edge/alerts.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";
import type { ActorContext } from "../shared/actor.js";
import { reliabilitySystemActor } from "./actor.js";
import { collectDependencyHealth } from "./health.js";
import { listStaleGateways, listStaleTransactions } from "./service.js";

export type ReliabilityScanResult = {
  staleTransactions: number;
  staleGateways: number;
  offlineGateways: number;
  recoveredGateways: number;
  notificationsAttempted: number;
};

export async function runReliabilityScan(actor?: ActorContext): Promise<ReliabilityScanResult> {
  const organizations = actor
    ? [{ id: actor.user.organizationId }]
    : await prisma.organization.findMany({ select: { id: true } });

  const result: ReliabilityScanResult = {
    staleTransactions: 0,
    staleGateways: 0,
    offlineGateways: 0,
    recoveredGateways: 0,
    notificationsAttempted: 0,
  };

  for (const organization of organizations) {
    const scanActor = actor ?? reliabilitySystemActor(organization.id);
    const siteId = await resolveSiteId(scanActor);
    if (!siteId) {
      continue;
    }

    const staleTransactions = await listStaleTransactions(scanActor);
    result.staleTransactions += staleTransactions.length;
    for (const transaction of staleTransactions) {
      result.notificationsAttempted += 1;
      await safeEmitOperationalEvent({
        actor: scanActor,
        type: "STALE_TRANSACTION",
        organizationId: organization.id,
        siteId: transaction.siteId,
        title: "Transaction requires attention",
        message: `${transaction.referenceNumber} has remained in ${transaction.status.replaceAll("_", " ").toLowerCase()} longer than the configured threshold.`,
        eventKey: EVENT_KEYS.staleTransaction(transaction.id),
        transactionId: transaction.id,
        entityType: "Transaction",
        entityId: transaction.id,
      });
    }

    const gateways = await listStaleGateways(scanActor);
    const day = dayBucket();
    for (const gateway of gateways) {
      if (gateway.liveness === "STALE") {
        result.staleGateways += 1;
        result.notificationsAttempted += 1;
        await safeEmitOperationalEvent({
          actor: scanActor,
          type: "GATEWAY_OFFLINE",
          organizationId: organization.id,
          siteId: gateway.siteId,
          title: "Edge Gateway heartbeat is stale",
          message: `${gateway.code} has not reported within the stale interval.`,
          eventKey: EVENT_KEYS.gatewayStale(gateway.id, day),
          entityType: "EdgeGateway",
          entityId: gateway.id,
        });
      }
      if (gateway.liveness === "OFFLINE") {
        result.offlineGateways += 1;
        result.notificationsAttempted += 1;
        emitGatewayOffline({
          organizationId: organization.id,
          siteId: gateway.siteId,
          gatewayId: gateway.id,
          gatewayCode: gateway.code,
          incidentKey: day,
        });
      }
      if (gateway.liveness === "ONLINE") {
        const open = await prisma.operationalAlert.findFirst({
          where: {
            organizationId: organization.id,
            status: { not: "RESOLVED" },
            OR: [
              { eventKey: { startsWith: `gateway.offline:${gateway.id}:` } },
              { eventKey: { startsWith: `gateway.stale:${gateway.id}:` } },
            ],
          },
          select: { id: true },
        });
        if (open) {
          result.recoveredGateways += 1;
          result.notificationsAttempted += 1;
          await safeEmitOperationalEvent({
            actor: scanActor,
            type: "GATEWAY_RECOVERED",
            organizationId: organization.id,
            siteId: gateway.siteId,
            title: "Edge Gateway recovered",
            message: `${gateway.code} is sending heartbeats again.`,
            eventKey: EVENT_KEYS.gatewayRecovered(gateway.id, day),
            entityType: "EdgeGateway",
            entityId: gateway.id,
          });
        }
      }
    }

    result.notificationsAttempted += await emitBackupNotifications(scanActor, organization.id, siteId);
    result.notificationsAttempted += await emitSyncNotifications(scanActor, organization.id);
    result.notificationsAttempted += await emitSystemDegraded(scanActor, organization.id, siteId);
  }

  if (actor) {
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.RELIABILITY_SCAN,
      entityType: "Organization",
      entityId: actor.user.organizationId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: result,
    });
  }

  writeLog("info", "reliability_scan_completed", result);
  return result;
}

async function emitBackupNotifications(actor: ActorContext, organizationId: string, siteId: string): Promise<number> {
  const lastFailure = await prisma.backupRun.findFirst({
    where: { status: BackupRunStatus.FAILED },
    orderBy: { finishedAt: "desc" },
  });
  const lastSuccess = await prisma.backupRun.findFirst({
    where: { status: BackupRunStatus.SUCCESS },
    orderBy: { finishedAt: "desc" },
  });
  const day = dayBucket();
  let count = 0;
  if (lastFailure && (!lastSuccess || (lastFailure.finishedAt ?? lastFailure.startedAt) > (lastSuccess.finishedAt ?? lastSuccess.startedAt))) {
    count += 1;
    await safeEmitOperationalEvent({
      actor,
      type: "BACKUP_FAILED",
      organizationId,
      siteId,
      title: "Database backup failed",
      message: "The last backup run did not verify successfully. Restore remains an administrator operation.",
      eventKey: EVENT_KEYS.backupFailed(day),
      entityType: "BackupRun",
      entityId: lastFailure.id,
    });
  } else if (lastSuccess && lastFailure && lastSuccess.finishedAt && lastFailure.finishedAt && lastSuccess.finishedAt > lastFailure.finishedAt) {
    count += 1;
    await safeEmitOperationalEvent({
      actor,
      type: "BACKUP_RECOVERED",
      organizationId,
      siteId,
      title: "Database backup recovered",
      message: "A later backup run verified successfully.",
      eventKey: EVENT_KEYS.backupRecovered(lastSuccess.id),
      entityType: "BackupRun",
      entityId: lastSuccess.id,
    });
  }
  return count;
}

async function emitSyncNotifications(actor: ActorContext, organizationId: string): Promise<number> {
  const snapshots = await prisma.edgeSyncSnapshot.findMany({
    where: { organizationId },
    include: { gateway: { select: { id: true, siteId: true, code: true } } },
  });
  const day = dayBucket();
  let count = 0;
  for (const snapshot of snapshots) {
    const failed = snapshot.syncStatus === "ERROR" || snapshot.deadLetter > 0;
    if (failed) {
      count += 1;
      await safeEmitOperationalEvent({
        actor,
        type: "SYNC_FAILURE",
        organizationId,
        siteId: snapshot.gateway.siteId,
        title: "Synchronization needs attention",
        message: `${snapshot.gateway.code} has sync errors or dead-letter events.`,
        eventKey: EVENT_KEYS.syncFailure(snapshot.gateway.id, day),
        entityType: "EdgeGateway",
        entityId: snapshot.gateway.id,
      });
      continue;
    }
    if (snapshot.connectivityState === "ONLINE" && snapshot.syncStatus !== "ERROR") {
      const open = await prisma.operationalAlert.findFirst({
        where: {
          organizationId,
          status: { not: "RESOLVED" },
          eventKey: { startsWith: `sync.failure:${snapshot.gateway.id}:` },
        },
        select: { id: true },
      });
      if (open) {
        count += 1;
        await safeEmitOperationalEvent({
          actor,
          type: "SYNC_RECOVERED",
          organizationId,
          siteId: snapshot.gateway.siteId,
          title: "Synchronization recovered",
          message: `${snapshot.gateway.code} is synchronizing again.`,
          eventKey: EVENT_KEYS.syncRecovered(snapshot.gateway.id, day),
          entityType: "EdgeGateway",
          entityId: snapshot.gateway.id,
        });
      }
    }
  }
  return count;
}

async function emitSystemDegraded(actor: ActorContext, organizationId: string, siteId: string): Promise<number> {
  const dependencies = await collectDependencyHealth();
  const degraded = dependencies.filter(
    (item) => item.status === "UNAVAILABLE" || item.status === "DEGRADED",
  );
  let count = 0;
  const day = dayBucket();
  for (const item of degraded) {
    count += 1;
    await safeEmitOperationalEvent({
      actor,
      type: "SYSTEM_DEGRADED",
      organizationId,
      siteId,
      title: "System dependency is degraded",
      message: `${item.name} is ${item.status.toLowerCase()}.`,
      eventKey: EVENT_KEYS.systemDegraded(item.name, day),
      entityType: "System",
      entityId: item.name,
    });
  }
  const healthy = dependencies.filter(
    (item) => item.status === "AVAILABLE" || item.status === "SIMULATION" || item.status === "DISABLED",
  );
  for (const item of healthy) {
    const open = await prisma.operationalAlert.findFirst({
      where: {
        organizationId,
        status: { not: "RESOLVED" },
        eventKey: { startsWith: `system.degraded:${item.name}:` },
      },
      select: { id: true, eventKey: true },
    });
    if (!open) {
      continue;
    }
    count += 1;
    await prisma.operationalAlert.update({
      where: { id: open.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    writeLog("info", "operational_incident_resolved", {
      eventKey: open.eventKey,
      component: item.name,
    });
  }
  return count;
}

async function resolveSiteId(actor: ActorContext): Promise<string | null> {
  if (actor.user.defaultSite?.id) {
    return actor.user.defaultSite.id;
  }
  const site = await prisma.site.findFirst({
    where: { organizationId: actor.user.organizationId, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return site?.id ?? null;
}
