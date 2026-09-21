import { HttpError } from "../../lib/httpError.js";
import { prisma } from "../../db/client.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { scopedTransactionWhere } from "../dashboard/filters.js";
import { parseDashboardFilters } from "../dashboard/validators.js";
import { accessibleSiteIds, assertRequestedScope } from "../shared/siteScope.js";
import type { ActorContext } from "../shared/actor.js";

export const EXPORT_CATEGORIES = ["transactions", "weighments", "audit", "security"] as const;
export type ExportCategory = (typeof EXPORT_CATEGORIES)[number];

const EXPORT_LIMIT = 2000;

export function isExportCategory(value: string): value is ExportCategory {
  return (EXPORT_CATEGORIES as readonly string[]).includes(value);
}

export function assertExportPermission(actor: ActorContext, category: ExportCategory): void {
  const permissions = actor.user.permissions;
  const allowed =
    category === "transactions" || category === "weighments"
      ? permissions.includes("reliability.read") || permissions.includes("report.read")
      : category === "audit"
        ? permissions.includes("reliability.read") || permissions.includes("audit.read")
        : permissions.includes("reliability.read") || permissions.includes("security.read");
  if (!allowed) {
    throw new HttpError(403, "You do not have access to this export");
  }
}

export async function buildReliabilityExport(
  actor: ActorContext,
  category: ExportCategory,
  query: Record<string, unknown>,
): Promise<{ filename: string; csv: string }> {
  assertExportPermission(actor, category);
  const filters = parseDashboardFilters(query, "Asia/Kolkata");
  await assertRequestedScope(actor, { siteId: filters.siteId, weighbridgeId: filters.weighbridgeId });
  const csv =
    category === "transactions"
      ? await exportTransactions(actor, filters)
      : category === "weighments"
        ? await exportWeighments(actor, filters)
        : category === "audit"
          ? await exportAudit(actor, filters)
          : await exportSecurity(actor, filters);

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.DATA_EXPORTED,
    entityType: "Export",
    entityId: category,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { category, rowEstimate: csv.split("\n").length - 1 },
  });

  return {
    filename: `trinetra-${category}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  };
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

async function exportTransactions(actor: ActorContext, filters: ReturnType<typeof parseDashboardFilters>): Promise<string> {
  const rows = await prisma.transaction.findMany({
    where: scopedTransactionWhere(actor, filters),
    select: {
      referenceNumber: true,
      status: true,
      site: { select: { code: true } },
      vehicle: { select: { registrationNumber: true } },
      material: { select: { code: true } },
      netWeightKg: true,
      arrivedAt: true,
      completedAt: true,
    },
    orderBy: { arrivedAt: "desc" },
    take: EXPORT_LIMIT,
  });
  return toCsv(
    ["reference", "status", "site", "vehicle", "material", "netKg", "arrivedAt", "completedAt"],
    rows.map((row) => [
      row.referenceNumber,
      row.status,
      row.site.code,
      row.vehicle?.registrationNumber ?? "",
      row.material?.code ?? "",
      row.netWeightKg?.toString() ?? "",
      row.arrivedAt.toISOString(),
      row.completedAt?.toISOString() ?? "",
    ]),
  );
}

async function exportWeighments(actor: ActorContext, filters: ReturnType<typeof parseDashboardFilters>): Promise<string> {
  const rows = await prisma.weighment.findMany({
    where: { transaction: scopedTransactionWhere(actor, filters) },
    select: {
      kind: true,
      weightKg: true,
      recordedAt: true,
      source: true,
      transaction: { select: { referenceNumber: true, site: { select: { code: true } } } },
    },
    orderBy: { recordedAt: "desc" },
    take: EXPORT_LIMIT,
  });
  return toCsv(
    ["reference", "site", "kind", "weightKg", "source", "recordedAt"],
    rows.map((row) => [
      row.transaction.referenceNumber,
      row.transaction.site.code,
      row.kind,
      row.weightKg.toString(),
      row.source,
      row.recordedAt.toISOString(),
    ]),
  );
}

async function exportAudit(actor: ActorContext, filters: ReturnType<typeof parseDashboardFilters>): Promise<string> {
  const siteIds = accessibleSiteIds(actor);
  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
      ...(siteIds
        ? {
            actorUser: { defaultSiteId: { in: siteIds } },
          }
        : {}),
    },
    select: {
      occurredAt: true,
      action: true,
      entityType: true,
      entityId: true,
      actorUser: { select: { fullName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: EXPORT_LIMIT,
  });
  return toCsv(
    ["occurredAt", "action", "entityType", "entityId", "actor"],
    rows.map((row) => [
      row.occurredAt.toISOString(),
      row.action,
      row.entityType,
      row.entityId,
      row.actorUser?.fullName ?? "",
    ]),
  );
}

async function exportSecurity(actor: ActorContext, filters: ReturnType<typeof parseDashboardFilters>): Promise<string> {
  const siteIds = accessibleSiteIds(actor);
  if (filters.siteId) {
    if (siteIds && !siteIds.includes(filters.siteId)) {
      throw new HttpError(403, "You do not have access to this site");
    }
  }
  const rows = await prisma.operationalAlert.findMany({
    where: {
      organizationId: actor.user.organizationId,
      type: {
        in: [
          "SYSTEM_ALERT",
          "WEIGHT_ANOMALY",
          "GATEWAY_OFFLINE",
          "BACKUP_FAILED",
          "SYNC_FAILURE",
          "SYSTEM_DEGRADED",
          "TRANSACTION_EXCEPTION",
        ],
      },
      ...(filters.siteId ? { siteId: filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    select: {
      createdAt: true,
      type: true,
      severity: true,
      status: true,
      title: true,
      site: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
  });
  return toCsv(
    ["createdAt", "type", "severity", "status", "site", "title"],
    rows.map((row) => [row.createdAt.toISOString(), row.type, row.severity, row.status, row.site.code, row.title]),
  );
}
