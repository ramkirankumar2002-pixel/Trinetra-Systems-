import { BackupTrigger, TransactionStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { checkAuditConsistency, checkTransactionConsistency } from "../../domain/reliability/consistency.js";
import { classifyGatewayLiveness, isStaleTransaction, STALE_ELIGIBLE_STATUSES } from "../../domain/reliability/stale.js";
import type { ConsistencyFinding, StaleTransactionThresholds } from "../../domain/reliability/types.js";
import { prisma } from "../../db/client.js";
import { publicDatabaseName } from "./pgDump.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds } from "../shared/siteScope.js";
import { backupOverview, listBackupRuns, runConfiguredBackup, type PublicBackupRun } from "./backup.js";
import { collectDependencyHealth, type PublicDependencyHealth } from "./health.js";

export type PublicStaleTransaction = {
  id: string;
  referenceNumber: string;
  status: TransactionStatus;
  siteId: string;
  updatedAt: string;
  warning: string;
};

export type PublicStaleGateway = {
  id: string;
  code: string;
  siteId: string;
  liveness: ReturnType<typeof classifyGatewayLiveness>;
  lastHeartbeatAt: string | null;
};

const CONSISTENCY_BATCH = 200;

export async function getReliabilityStatus(actor: ActorContext) {
  const [dependencies, backup, staleTransactions, staleGateways, openWarnings] = await Promise.all([
    collectDependencyHealth(),
    backupOverview(),
    listStaleTransactions(actor),
    listStaleGateways(actor),
    countOpenRecoveryWarnings(actor),
  ]);

  return {
    systemStatus: overallFromDependencies(dependencies),
    databaseName: publicDatabaseName(env.databaseUrl),
    dependencies,
    backup,
    staleTransactions: staleTransactions.slice(0, 8),
    staleTransactionCount: staleTransactions.length,
    offlineGateways: staleGateways.filter((item) => item.liveness === "OFFLINE" || item.liveness === "STALE"),
    openRecoveryWarnings: openWarnings,
  };
}

export async function listStaleTransactions(actor: ActorContext): Promise<PublicStaleTransaction[]> {
  const siteIds = accessibleSiteIds(actor);
  const rows = await prisma.transaction.findMany({
    where: {
      organizationId: actor.user.organizationId,
      status: { in: STALE_ELIGIBLE_STATUSES },
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      siteId: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  const now = new Date();
  const thresholds = staleThresholdsFromEnv();
  return rows
    .filter((row) => isStaleTransaction({ status: row.status, updatedAt: row.updatedAt, now, thresholds }))
    .map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber,
      status: row.status,
      siteId: row.siteId,
      updatedAt: row.updatedAt.toISOString(),
      warning: "Transaction requires attention.",
    }));
}

export async function listStaleGateways(actor: ActorContext): Promise<PublicStaleGateway[]> {
  const siteIds = accessibleSiteIds(actor);
  const rows = await prisma.edgeGateway.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
    select: { id: true, code: true, siteId: true, lastHeartbeatAt: true, enabled: true, revokedAt: true },
  });
  const nowMs = Date.now();
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    siteId: row.siteId,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    liveness: classifyGatewayLiveness({
      lastHeartbeatAt: row.lastHeartbeatAt,
      nowMs,
      staleAfterMs: env.gatewayStaleAfterMs,
      offlineAfterMs: env.gatewayOfflineTimeoutMs,
      enabled: row.enabled,
      revokedAt: row.revokedAt,
    }),
  }));
}

export async function runConsistencyReport(actor: ActorContext, query: Record<string, unknown>): Promise<{
  findings: ConsistencyFinding[];
  scanned: number;
}> {
  const siteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;
  if (siteId) {
    assertSiteAccess(actor.user, siteId);
  }
  const siteIds = accessibleSiteIds(actor);
  const transactions = await prisma.transaction.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(siteId ? { siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    },
    include: {
      weighments: { select: { kind: true, weightKg: true } },
      approvals: { select: { decision: true } },
      unloading: { select: { status: true } },
    },
    take: CONSISTENCY_BATCH,
    orderBy: { updatedAt: "desc" },
  });

  const audits = await prisma.auditLog.findMany({
    where: {
      organizationId: actor.user.organizationId,
      entityType: "Transaction",
      entityId: { in: transactions.map((item) => item.id) },
    },
    select: { entityId: true, action: true },
  });
  const actionsByTransaction = new Map<string, string[]>();
  for (const audit of audits) {
    const current = actionsByTransaction.get(audit.entityId) ?? [];
    current.push(audit.action);
    actionsByTransaction.set(audit.entityId, current);
  }

  const findings: ConsistencyFinding[] = [];
  for (const transaction of transactions) {
    findings.push(
      ...checkTransactionConsistency({
        id: transaction.id,
        referenceNumber: transaction.referenceNumber,
        status: transaction.status,
        netWeightKg: transaction.netWeightKg?.toString() ?? null,
        weighments: transaction.weighments.map((item) => ({ kind: item.kind, weightKg: item.weightKg.toString() })),
        approvals: transaction.approvals,
        unloading: transaction.unloading,
      }),
      ...checkAuditConsistency({
        transactionId: transaction.id,
        referenceNumber: transaction.referenceNumber,
        status: transaction.status,
        auditActions: actionsByTransaction.get(transaction.id) ?? [],
      }),
    );
  }

  return { findings, scanned: transactions.length };
}

export async function triggerBackup(actor: ActorContext): Promise<PublicBackupRun> {
  return runConfiguredBackup({ trigger: BackupTrigger.MANUAL, actor });
}

export { listBackupRuns };

function staleThresholdsFromEnv(): StaleTransactionThresholds {
  return {
    documentPendingHours: env.staleDocumentPendingHours,
    pendingApprovalHours: env.stalePendingApprovalHours,
    unloadingHours: env.staleUnloadingHours,
    secondWeighmentHours: env.staleSecondWeighmentHours,
    intermediateHours: env.staleIntermediateHours,
  };
}

async function countOpenRecoveryWarnings(actor: ActorContext): Promise<number> {
  const siteIds = accessibleSiteIds(actor);
  return prisma.operationalAlert.count({
    where: {
      organizationId: actor.user.organizationId,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      type: { in: ["BACKUP_FAILED", "GATEWAY_OFFLINE", "SYNC_FAILURE", "STALE_TRANSACTION", "SYSTEM_DEGRADED", "SYSTEM_ALERT"] },
      ...(siteIds ? { siteId: { in: siteIds } } : {}),
    },
  });
}

function overallFromDependencies(dependencies: PublicDependencyHealth[]): "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" {
  if (dependencies.some((item) => item.name === "postgresql" && item.status === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (dependencies.some((item) => item.status === "UNAVAILABLE" || item.status === "DEGRADED")) {
    return "DEGRADED";
  }
  return "AVAILABLE";
}

