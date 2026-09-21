import { ApprovalDecision, Prisma, TransactionStatus, WeighmentSource } from "@prisma/client";
import { REPORT_DATE_PRESETS } from "../../domain/reporting/datePresets.js";
import { EXCEPTION_FAMILIES } from "../../domain/reporting/exceptionFamilies.js";
import {
  addCalendarDays,
  calendarDateInTimeZone,
  currentSiteDayBounds,
  zonedDayBounds,
} from "../../domain/siteDay.js";
import {
  canSeeAllSiteApprovals,
  resolveDashboardCapabilities,
  type DashboardCapabilities,
} from "../../domain/dashboardScope.js";
import {
  approvalEligibilityFromUser,
  eligibleDepartmentCodes,
} from "../../domain/approvalEligibility.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, accessibleSiteWhere } from "../shared/siteScope.js";
import {
  completedWhere,
  exceptionFamilyWhere,
  exceptionWhere,
  liveWhere,
  pendingUnloadingWhere,
  scopedTransactionWhere,
} from "./filters.js";
import {
  dashboardTransactionInclude,
  toDashboardApproval,
  toDashboardException,
  toDashboardTransaction,
  toPublicAuditItem,
  type PublicAuditItem,
  type PublicDashboardApproval,
  type PublicDashboardException,
  type PublicDashboardTransaction,
} from "./mapper.js";
import { dashboardAnomalySummary } from "../anomalies/service.js";
import type { PublicWeightAnomaly } from "../anomalies/mapper.js";
import { listDashboardAlerts } from "../notifications/alerts.js";
import type { PublicOperationalAlert } from "../notifications/mapper.js";
import { parseDashboardFilters, parseDashboardPagination, type DashboardFilterInput } from "./validators.js";
import { resolveReportTimezone } from "./timezone.js";
import {
  enhancedDashboardCharts,
  reportContext,
  reportExceptionsAnalytics,
  reportMaterialsAnalytics,
  reportMetaFor,
  reportVehiclesAnalytics,
} from "./reportAnalytics.js";

const DASHBOARD_LIST_SIZE = 8;

export type DashboardKpis = {
  totalTransactions: number;
  todayTransactions: number;
  activeTransactions: number;
  completedTransactions: number;
  pendingApprovals: number;
  pendingUnloading: number;
  exceptions: number;
  totalMaterialWeightKg: string;
  todayDate: string;
  timezone: string;
  totalMaterialWeightScope: "completed_net";
  identifiedToday: number;
  manualIdentificationsToday: number;
  anprFailuresToday: number;
  unregisteredVehiclesToday: number;
};

export type DashboardPayload = {
  capabilities: DashboardCapabilities;
  kpis: DashboardKpis;
  live: PublicDashboardTransaction[];
  recent: PublicDashboardTransaction[];
  pendingApprovals: PublicDashboardApproval[];
  pendingUnloading: PublicDashboardTransaction[];
  exceptions: PublicDashboardException[];
  alerts: PublicOperationalAlert[];
  weightAnomalies: {
    open: number;
    today: number;
    critical: number;
    repeated: number;
    recovered: number;
    items: PublicWeightAnomaly[];
  };
  audit: PublicAuditItem[];
  empty: {
    live: boolean;
    recent: boolean;
    pendingApprovals: boolean;
    pendingUnloading: boolean;
    exceptions: boolean;
    alerts: boolean;
    weightAnomalies: boolean;
    audit: boolean;
    kpis: boolean;
  };
};

export type ChartPayload = {
  byStatus: Array<{ label: string; value: number }>;
  byMaterial: Array<{ label: string; value: number }>;
  dailyVolume: Array<{ label: string; value: number }>;
  netWeightByMaterial: Array<{ label: string; value: number }>;
  netWeightByDay: Array<{ label: string; value: number }>;
  bySite: Array<{ label: string; value: number }>;
  exceptionCount: Array<{ label: string; value: number }>;
  approvalStatus: Array<{ label: string; value: number }>;
  gatewayStatus: Array<{ label: string; value: number }>;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  meta?: {
    empty: boolean;
    emptyMessage: string | null;
    timezone: string;
    from: string | null;
    to: string | null;
    datePreset: string;
    netWeightSource: "transaction.netWeightKg";
  };
};

export async function getDashboard(actor: ActorContext, query: Record<string, unknown>): Promise<DashboardPayload> {
  const capabilities = resolveDashboardCapabilities(actor.user);
  const timeZone = await resolveReportTimezone(actor, query);
  const filters = parseDashboardFilters(query, timeZone);
  const base = scopedTransactionWhere(actor, filters);
  const today = currentSiteDayBounds(timeZone);
  const todayWhere: Prisma.TransactionWhereInput = {
    ...scopedTransactionWhere(actor, { ...filters, from: today.start, to: new Date(today.end.getTime() - 1) }),
  };
  const pendingApprovalWhere = await approvalWhere(actor, filters, ApprovalDecision.PENDING);
  const scopedSiteIds = accessibleSiteIds(actor);
  const anprSiteScope = scopedSiteIds === null ? {} : { siteId: { in: scopedSiteIds } };

  const [
    totalTransactions,
    todayTransactions,
    activeTransactions,
    completedTransactions,
    pendingApprovals,
    pendingUnloading,
    exceptions,
    weightAggregate,
    liveRows,
    recentRows,
    approvalRows,
    unloadingRows,
    exceptionRows,
    alertRows,
    auditRows,
    identifiedToday,
    manualIdentificationsToday,
    anprFailuresToday,
    unregisteredVehiclesToday,
    anomalySummary,
  ] = await Promise.all([
    prisma.transaction.count({ where: base }),
    prisma.transaction.count({ where: todayWhere }),
    prisma.transaction.count({ where: liveWhere(base) }),
    prisma.transaction.count({ where: completedWhere(base) }),
    capabilities.pendingApprovals ? prisma.approval.count({ where: pendingApprovalWhere }) : Promise.resolve(0),
    prisma.transaction.count({ where: pendingUnloadingWhere(base) }),
    prisma.transaction.count({ where: exceptionWhere(base) }),
    prisma.transaction.aggregate({
      where: completedWhere(base),
      _sum: { netWeightKg: true },
    }),
    prisma.transaction.findMany({
      where: liveWhere(base),
      include: dashboardTransactionInclude,
      orderBy: { updatedAt: "desc" },
      take: DASHBOARD_LIST_SIZE,
    }),
    prisma.transaction.findMany({
      where: base,
      include: dashboardTransactionInclude,
      orderBy: { arrivedAt: "desc" },
      take: DASHBOARD_LIST_SIZE,
    }),
    capabilities.pendingApprovals
      ? prisma.approval.findMany({
          where: pendingApprovalWhere,
          include: {
            department: { select: { id: true, code: true, name: true } },
            transaction: { include: dashboardTransactionInclude },
          },
          orderBy: { requestedAt: "desc" },
          take: DASHBOARD_LIST_SIZE,
        })
      : Promise.resolve([]),
    capabilities.pendingUnloading
      ? prisma.transaction.findMany({
          where: pendingUnloadingWhere(base),
          include: dashboardTransactionInclude,
          orderBy: { updatedAt: "desc" },
          take: DASHBOARD_LIST_SIZE,
        })
      : Promise.resolve([]),
    prisma.transaction.findMany({
      where: exceptionWhere(base),
      include: dashboardTransactionInclude,
      orderBy: { updatedAt: "desc" },
      take: DASHBOARD_LIST_SIZE,
    }),
    capabilities.alerts ? listDashboardAlerts(actor, query) : Promise.resolve([]),
    capabilities.audit ? loadAuditItems(actor, 8) : Promise.resolve([]),
    prisma.vehicleIdentificationEvent.count({
      where: {
        organizationId: actor.user.organizationId,
        createdAt: { gte: today.start, lt: today.end },
        outcome: { in: ["CONFIRMED", "MANUAL"] },
        ...anprSiteScope,
      },
    }),
    prisma.vehicleIdentificationEvent.count({
      where: {
        organizationId: actor.user.organizationId,
        createdAt: { gte: today.start, lt: today.end },
        source: "MANUAL",
        outcome: { in: ["CONFIRMED", "MANUAL"] },
        ...anprSiteScope,
      },
    }),
    prisma.anprDetection.count({
      where: {
        organizationId: actor.user.organizationId,
        capturedAt: { gte: today.start, lt: today.end },
        source: "ANPR",
        OR: [{ confidenceBand: "NONE" }, { normalizedPlate: null }],
        ...anprSiteScope,
      },
    }),
    prisma.vehicleIdentificationEvent.count({
      where: {
        organizationId: actor.user.organizationId,
        createdAt: { gte: today.start, lt: today.end },
        outcome: "NO_MATCH",
        ...anprSiteScope,
      },
    }),
    capabilities.weightAnomalies
      ? dashboardAnomalySummary(actor, {
          ...(filters.siteId ? { siteId: filters.siteId } : {}),
          ...(filters.weighbridgeId ? { weighbridgeId: filters.weighbridgeId } : {}),
        })
      : Promise.resolve({ open: 0, today: 0, critical: 0, repeated: 0, recovered: 0, items: [] }),
  ]);

  const live = liveRows.map(toDashboardTransaction);
  const recent = recentRows.map(toDashboardTransaction);
  const pendingApprovalItems = approvalRows.map((row) =>
    toDashboardApproval(row.transaction, row, actor.user.permissions.includes("approval.decide")),
  );
  const unloading = unloadingRows.map(toDashboardTransaction);
  const exceptionItems = exceptionRows.map(toDashboardException);

  return {
    capabilities,
    kpis: {
      totalTransactions,
      todayTransactions,
      activeTransactions,
      completedTransactions,
      pendingApprovals,
      pendingUnloading,
      exceptions,
      totalMaterialWeightKg: weightAggregate._sum.netWeightKg?.toString() ?? "0",
      todayDate: today.date,
      timezone: timeZone,
      totalMaterialWeightScope: "completed_net",
      identifiedToday,
      manualIdentificationsToday,
      anprFailuresToday,
      unregisteredVehiclesToday,
    },
    live,
    recent,
    pendingApprovals: pendingApprovalItems,
    pendingUnloading: unloading,
    exceptions: exceptionItems,
    alerts: alertRows,
    weightAnomalies: anomalySummary,
    audit: auditRows,
    empty: {
      live: live.length === 0,
      recent: recent.length === 0,
      pendingApprovals: pendingApprovalItems.length === 0,
      pendingUnloading: unloading.length === 0,
      exceptions: exceptionItems.length === 0,
      alerts: alertRows.length === 0,
      weightAnomalies: anomalySummary.items.length === 0,
      audit: auditRows.length === 0,
      kpis: totalTransactions === 0,
    },
  };
}

export async function listLiveTransactions(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicDashboardTransaction>> {
  return paginatedTransactions(actor, query, (base) => liveWhere(base));
}

export async function listRecentTransactions(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicDashboardTransaction>> {
  return paginatedTransactions(actor, query, (base) => base);
}

export async function listPendingUnloading(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicDashboardTransaction>> {
  const capabilities = resolveDashboardCapabilities(actor.user);
  if (!capabilities.pendingUnloading) {
    throw new HttpError(403, "You do not have access to unloading monitoring");
  }
  return paginatedTransactions(actor, query, (base) => pendingUnloadingWhere(base));
}

export async function listDashboardExceptions(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicDashboardException>> {
  const timeZone = await resolveReportTimezone(actor, query);
  const filters = parseDashboardFilters(query, timeZone);
  const pagination = parseDashboardPagination(query);
  const where = exceptionWhere(scopedTransactionWhere(actor, filters));
  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: dashboardTransactionInclude,
      orderBy: { updatedAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map(toDashboardException),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function listDashboardApprovals(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicDashboardApproval>> {
  const capabilities = resolveDashboardCapabilities(actor.user);
  if (!capabilities.pendingApprovals) {
    throw new HttpError(403, "You do not have access to approval monitoring");
  }

  const timeZone = await resolveReportTimezone(actor, query);
  const filters = parseDashboardFilters(query, timeZone);
  const pagination = parseDashboardPagination(query);
  const where = await approvalWhere(actor, filters, ApprovalDecision.PENDING);
  const [total, rows] = await prisma.$transaction([
    prisma.approval.count({ where }),
    prisma.approval.findMany({
      where,
      include: {
        department: { select: { id: true, code: true, name: true } },
        transaction: { include: dashboardTransactionInclude },
      },
      orderBy: { requestedAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map((row) =>
      toDashboardApproval(row.transaction, row, actor.user.permissions.includes("approval.decide")),
    ),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function listDashboardAudit(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<Paginated<PublicAuditItem>> {
  if (!resolveDashboardCapabilities(actor.user).audit) {
    throw new HttpError(403, "You do not have access to audit information");
  }
  const pagination = parseDashboardPagination(query);
  const items = await loadAuditItems(actor, pagination.pageSize, pagination.skip);
  const total = await countDashboardAudit(actor);
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getDashboardCharts(actor: ActorContext, query: Record<string, unknown>): Promise<ChartPayload> {
  if (!resolveDashboardCapabilities(actor.user).charts) {
    throw new HttpError(403, "You do not have access to dashboard charts");
  }

  const timeZone = await resolveReportTimezone(actor, query);
  const filters = parseDashboardFilters(query, timeZone);
  const base = scopedTransactionWhere(actor, filters);
  const today = currentSiteDayBounds(timeZone);
  const rangeStart = filters.from ?? zonedDaysAgo(timeZone, today.date, 13);
  const rangeEnd = filters.to ?? new Date(today.end.getTime() - 1);
  const rangedFilters: DashboardFilterInput = { ...filters, from: rangeStart, to: rangeEnd };

  const [statusGroups, materialGroups, netGroups, extra] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["materialId"],
      where: base,
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["materialId"],
      where: completedWhere(base),
      _sum: { netWeightKg: true },
    }),
    enhancedDashboardCharts(actor, rangedFilters, timeZone),
  ]);

  const materialIds = [
    ...new Set(
      [...materialGroups, ...netGroups]
        .map((row) => row.materialId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, name: true, code: true },
  });
  const materialName = new Map(materials.map((material) => [material.id, `${material.name}`]));

  const dailyCounts = new Map<string, number>();
  const dailyNet = new Map<string, number>();
  let cursor = calendarDateInTimeZone(rangeStart, timeZone);
  const last = calendarDateInTimeZone(rangeEnd, timeZone);
  while (cursor <= last) {
    dailyCounts.set(cursor, 0);
    dailyNet.set(cursor, 0);
    cursor = addCalendarDays(cursor, 1);
  }
  for (const row of extra.dailyVolumeActual) {
    dailyCounts.set(row.label, row.value);
  }
  for (const row of extra.netWeightByDay) {
    dailyNet.set(row.label, row.value);
  }

  return {
    byStatus: statusGroups
      .map((row) => ({ label: row.status, value: row._count._all }))
      .sort((left, right) => right.value - left.value),
    byMaterial: materialGroups
      .map((row) => ({
        label: row.materialId ? (materialName.get(row.materialId) ?? "Unassigned") : "Unassigned",
        value: row._count._all,
      }))
      .sort((left, right) => right.value - left.value),
    dailyVolume: [...dailyCounts.entries()].map(([label, value]) => ({ label, value })),
    netWeightByMaterial: netGroups
      .map((row) => ({
        label: row.materialId ? (materialName.get(row.materialId) ?? "Unassigned") : "Unassigned",
        value: Number(row._sum.netWeightKg ?? 0),
      }))
      .sort((left, right) => right.value - left.value),
    netWeightByDay: [...dailyNet.entries()].map(([label, value]) => ({ label, value })),
    bySite: extra.bySite,
    exceptionCount: extra.exceptionCount,
    approvalStatus: extra.approvalStatus,
    gatewayStatus: extra.gatewayStatus,
  };
}

export async function reportTransactions(
  actor: ActorContext,
  query: Record<string, unknown>,
  options: { take?: number } = {},
): Promise<Paginated<PublicDashboardTransaction>> {
  const ctx = await reportContext(actor, query, "transactions");
  const family = ctx.filters.exceptionFamily;
  if (family === "PROVIDER_EXCEPTION" || family === "SYNCHRONIZATION_EXCEPTION") {
    return {
      items: [],
      page: 1,
      pageSize: options.take ?? ctx.pagination.pageSize,
      total: 0,
      meta: reportMetaFor(ctx, true),
    };
  }
  const result = await paginatedTransactions(
    actor,
    query,
    (base) => (family ? exceptionFamilyWhere(base, family) : base),
    options,
  );
  return { ...result, meta: reportMetaFor(ctx, result.total === 0) };
}

export async function reportMaterials(
  actor: ActorContext,
  query: Record<string, unknown>,
) {
  assertReports(actor);
  return reportMaterialsAnalytics(actor, query);
}

export async function reportVehicles(
  actor: ActorContext,
  query: Record<string, unknown>,
) {
  assertReports(actor);
  return reportVehiclesAnalytics(actor, query);
}

export async function reportExceptions(
  actor: ActorContext,
  query: Record<string, unknown>,
) {
  assertReports(actor);
  return reportExceptionsAnalytics(actor, query);
}

export async function dashboardLookups(actor: ActorContext): Promise<{
  sites: Array<{ id: string; code: string; name: string }>;
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string }>;
  materials: Array<{ id: string; code: string; name: string }>;
  workflows: Array<{ id: string; code: string; name: string }>;
  suppliers: Array<{ id: string; name: string; code: string | null }>;
  statuses: string[];
  datePresets: readonly string[];
  exceptionFamilies: readonly string[];
  weighmentSources: string[];
  timezone: string;
}> {
  const siteWhere = accessibleSiteWhere(actor);
  const [sites, weighbridges, materials, workflows, suppliers] = await Promise.all([
    prisma.site.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, timezone: true },
      orderBy: { name: "asc" },
    }),
    prisma.weighbridge.findMany({
      where: { organizationId: actor.user.organizationId },
      select: { id: true, code: true, name: true, siteId: true },
      orderBy: { code: "asc" },
    }),
    prisma.material.findMany({
      where: { organizationId: actor.user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.workflowDefinition.findMany({
      where: { organizationId: actor.user.organizationId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.supplier.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const accessibleSites = sites.filter((site) => canAccessFromWhere(actor, site.id, siteWhere));
  const timezone = await resolveReportTimezone(actor, {});

  return {
    sites: accessibleSites.map((site) => ({ id: site.id, code: site.code, name: site.name })),
    weighbridges: weighbridges.filter((item) => canAccessFromWhere(actor, item.siteId, siteWhere)),
    materials,
    workflows,
    suppliers,
    statuses: Object.values(TransactionStatus),
    datePresets: REPORT_DATE_PRESETS,
    exceptionFamilies: EXCEPTION_FAMILIES,
    weighmentSources: Object.values(WeighmentSource),
    timezone,
  };
}

export async function reportLookups(actor: ActorContext) {
  assertReports(actor);
  return dashboardLookups(actor);
}

async function paginatedTransactions(
  actor: ActorContext,
  query: Record<string, unknown>,
  refine: (base: Prisma.TransactionWhereInput) => Prisma.TransactionWhereInput,
  options: { take?: number } = {},
): Promise<Paginated<PublicDashboardTransaction>> {
  const timeZone = await resolveReportTimezone(actor, query);
  const filters = parseDashboardFilters(query, timeZone);
  const pagination = parseDashboardPagination(query);
  const take = options.take ?? pagination.pageSize;
  const skip = options.take ? 0 : pagination.skip;
  const where = refine(scopedTransactionWhere(actor, filters));
  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: dashboardTransactionInclude,
      orderBy: { arrivedAt: "desc" },
      skip,
      take,
    }),
  ]);

  return {
    items: rows.map(toDashboardTransaction),
    page: pagination.page,
    pageSize: take,
    total,
  };
}

async function approvalWhere(
  actor: ActorContext,
  filters: DashboardFilterInput,
  decision: ApprovalDecision,
): Promise<Prisma.ApprovalWhereInput> {
  if (filters.siteId) {
    assertSiteAccess(actor.user, filters.siteId);
  }

  const siteScope = accessibleSiteWhere(actor);
  const where: Prisma.ApprovalWhereInput = {
    organizationId: actor.user.organizationId,
    decision,
    ...(filters.siteId ? { siteId: filters.siteId } : approvalSiteWhere(siteScope)),
  };

  if (filters.from || filters.to) {
    where.requestedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.materialId) {
    where.transaction = { materialId: filters.materialId };
  }

  if (canSeeAllSiteApprovals(actor.user)) {
    return where;
  }

  const eligibility = approvalEligibilityFromUser(actor.user);
  const departmentCodes = eligibleDepartmentCodes(eligibility.roleCodes, eligibility.departmentCode);
  return {
    AND: [
      where,
      {
        OR: [
          { assignedUserId: actor.user.id },
          ...(eligibility.departmentId ? [{ departmentId: eligibility.departmentId }] : []),
          ...(departmentCodes.length > 0 ? [{ department: { code: { in: departmentCodes } } }] : []),
        ],
      },
    ],
  };
}

function approvalSiteWhere(siteScope: Prisma.TransactionWhereInput): Prisma.ApprovalWhereInput {
  if (typeof siteScope.siteId === "string") {
    return { siteId: siteScope.siteId };
  }
  if (siteScope.siteId && typeof siteScope.siteId === "object" && "in" in siteScope.siteId) {
    const ids = siteScope.siteId.in;
    if (Array.isArray(ids)) {
      return { siteId: { in: ids.filter((value): value is string => typeof value === "string") } };
    }
  }
  return {};
}

async function loadAuditItems(
  actor: ActorContext,
  take: number,
  skip = 0,
): Promise<PublicAuditItem[]> {
  const where = await auditWhere(actor);
  const rows = await prisma.auditLog.findMany({
    where,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      occurredAt: true,
      metadata: true,
      actorUser: { select: { fullName: true } },
    },
    orderBy: { occurredAt: "desc" },
    skip,
    take,
  });
  return rows.map(toPublicAuditItem);
}

async function countDashboardAudit(actor: ActorContext): Promise<number> {
  return prisma.auditLog.count({ where: await auditWhere(actor) });
}

async function auditWhere(actor: ActorContext): Promise<Prisma.AuditLogWhereInput> {
  const base: Prisma.AuditLogWhereInput = { organizationId: actor.user.organizationId };
  const siteScope = accessibleSiteWhere(actor);
  if (Object.keys(siteScope).length === 0) {
    return base;
  }

  const transactions = await prisma.transaction.findMany({
    where: { organizationId: actor.user.organizationId, ...siteScope },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const ids = transactions.map((row) => row.id);
  if (ids.length === 0) {
    return { ...base, id: "__none__" };
  }
  return {
    ...base,
    entityType: "Transaction",
    entityId: { in: ids },
  };
}

function zonedDaysAgo(timeZone: string, todayYmd: string, days: number): Date {
  return zonedDayBounds(timeZone, addCalendarDays(todayYmd, -days)).start;
}

function canAccessFromWhere(
  actor: ActorContext,
  siteId: string,
  siteScope: Prisma.TransactionWhereInput,
): boolean {
  if (Object.keys(siteScope).length === 0) {
    return true;
  }
  try {
    assertSiteAccess(actor.user, siteId);
    return true;
  } catch {
    return false;
  }
}

function assertReports(actor: ActorContext): void {
  if (!resolveDashboardCapabilities(actor.user).reports) {
    throw new HttpError(403, "You do not have access to reports");
  }
}
