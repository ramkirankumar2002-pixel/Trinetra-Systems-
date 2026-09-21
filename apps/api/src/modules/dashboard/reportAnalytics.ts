import {
  ApprovalDecision,
  HardwareDeviceStatus,
  Prisma,
  TransactionStatus,
  WeightAnomalyStatus,
} from "@prisma/client";
import { REPORT_DATE_PRESETS, EMPTY_REPORT_MESSAGE, INSUFFICIENT_DATA } from "../../domain/reporting/datePresets.js";
import { EXCEPTION_FAMILIES, familyFromDashboardType, PROVIDER_ALERT_TYPES } from "../../domain/reporting/exceptionFamilies.js";
import { averageDuration, durationBetween, formatDurationMs } from "../../domain/reporting/duration.js";
import { kgToMilligrams, milligramsToKgDecimal } from "../../domain/netWeight.js";
import { REPORT_CATALOG, type ReportId } from "../../domain/reporting/catalog.js";
import { resolveDashboardCapabilities } from "../../domain/dashboardScope.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { listWeightAnomalies } from "../anomalies/service.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, assertRequestedScope } from "../shared/siteScope.js";
import {
  completedWhere,
  exceptionFamilyWhere,
  exceptionWhere,
  liveWhere,
  scopedTransactionWhere,
} from "./filters.js";
import {
  dashboardTransactionInclude,
  toDashboardException,
} from "./mapper.js";
import {
  sqlAverageTransactionDurationByWeighbridge,
  sqlAverageWeighmentDurationByWeighbridge,
  sqlDailyTransactionAggregates,
  sqlStageAverageMs,
  sqlWeighmentTotalsByMaterial,
} from "./reportSql.js";
import { parseDashboardPagination, parseReportFilters, type DashboardFilterInput } from "./validators.js";
import { resolveReportTimezone } from "./timezone.js";

export type ReportMeta = {
  empty: boolean;
  emptyMessage: string | null;
  timezone: string;
  from: string | null;
  to: string | null;
  datePreset: string;
  netWeightSource: "transaction.netWeightKg";
};

type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  meta: ReportMeta;
};

export async function reportWeighments(
  actor: ActorContext,
  query: Record<string, unknown>,
  options: { take?: number } = {},
): Promise<
  Paginated<{
    id: string;
    transactionId: string;
    transaction: string;
    vehicleNumber: string | null;
    weighbridge: { id: string; code: string; name: string } | null;
    kind: string;
    weightKg: string;
    unit: "KG";
    stability: string;
    source: string;
    recordedAt: string;
  }>
> {
  const ctx = await reportContext(actor, query, "weighments");
  if (ctx.filters.stability) {
    return {
      items: [],
      page: 1,
      pageSize: ctx.pagination.pageSize,
      total: 0,
      meta: emptyMeta(ctx),
    };
  }

  const where: Prisma.WeighmentWhereInput = {
    transaction: scopedTransactionWhere(actor, ctx.filters),
    ...(ctx.filters.source ? { source: ctx.filters.source } : {}),
    ...(ctx.filters.weighmentKind ? { kind: ctx.filters.weighmentKind } : {}),
  };
  const take = options.take ?? ctx.pagination.pageSize;
  const skip = options.take ? 0 : ctx.pagination.skip;
  const [total, rows] = await prisma.$transaction([
    prisma.weighment.count({ where }),
    prisma.weighment.findMany({
      where,
      select: {
        id: true,
        kind: true,
        weightKg: true,
        source: true,
        recordedAt: true,
        weighbridge: { select: { id: true, code: true, name: true } },
        transaction: {
          select: {
            id: true,
            referenceNumber: true,
            vehicle: { select: { displayRegistrationNumber: true } },
          },
        },
      },
      orderBy: { recordedAt: "desc" },
      skip,
      take,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      transactionId: row.transaction.id,
      transaction: row.transaction.referenceNumber,
      vehicleNumber: row.transaction.vehicle?.displayRegistrationNumber ?? null,
      weighbridge: row.weighbridge,
      kind: row.kind,
      weightKg: row.weightKg.toString(),
      unit: "KG",
      stability: INSUFFICIENT_DATA,
      source: row.source,
      recordedAt: row.recordedAt.toISOString(),
    })),
    page: ctx.pagination.page,
    pageSize: take,
    total,
    meta: reportMetaFor(ctx, total === 0),
  };
}

export async function reportMaterialsAnalytics(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "materials");
  const where = scopedTransactionWhere(actor, ctx.filters);
  const [groups, weighmentTotals, assignments] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["materialId", "workflowDefinitionId", "siteId"],
      where,
      _count: { _all: true },
      _sum: { netWeightKg: true },
    }),
    sqlWeighmentTotalsByMaterial(actor, ctx.filters),
    prisma.materialWorkflowAssignment.findMany({
      where: {
        organizationId: actor.user.organizationId,
        effectiveTo: null,
        ...(ctx.filters.siteId ? { OR: [{ siteId: ctx.filters.siteId }, { siteId: null }] } : {}),
      },
      select: {
        materialId: true,
        siteId: true,
        workflowDefinition: { select: { code: true, name: true } },
      },
    }),
  ]);

  const materialIds = [...new Set(groups.map((row) => row.materialId).filter((id): id is string => id !== null))];
  const siteIds = [...new Set(groups.map((row) => row.siteId))];
  const workflowIds = [...new Set(groups.map((row) => row.workflowDefinitionId).filter((id): id is string => id !== null))];
  const [materials, sites, workflows] = await Promise.all([
    prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, name: true, code: true } }),
    prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true, code: true } }),
    prisma.workflowDefinition.findMany({ where: { id: { in: workflowIds } }, select: { id: true, code: true, name: true } }),
  ]);
  const materialName = new Map(materials.map((item) => [item.id, `${item.name} (${item.code})`]));
  const siteName = new Map(sites.map((item) => [item.id, item.name]));
  const workflowName = new Map(workflows.map((item) => [item.id, `${item.code} · ${item.name}`]));
  const configured = new Map(
    assignments.map((row) => [`${row.materialId}:${row.siteId ?? "*"}`, `${row.workflowDefinition.code} · ${row.workflowDefinition.name}`]),
  );

  const rolled = new Map<
    string,
    {
      materialId: string | null;
      material: string;
      transactionCount: number;
      totalGrossWeightKg: string;
      totalTareWeightKg: string;
      totalNetWeightKg: string;
      workflowClassification: string;
      configuredWorkflow: string;
      site: string;
    }
  >();

  for (const row of groups) {
    const key = row.materialId ?? "none";
    const current = rolled.get(key);
    const weights = weighmentTotals.get(key) ?? { gross: "0", tare: "0" };
    const workflow = row.workflowDefinitionId ? (workflowName.get(row.workflowDefinitionId) ?? "Unassigned") : "Unassigned";
    const configuredWorkflow =
      (row.materialId ? configured.get(`${row.materialId}:${row.siteId}`) : undefined) ??
      (row.materialId ? configured.get(`${row.materialId}:*`) : undefined) ??
      INSUFFICIENT_DATA;
    if (current) {
      current.transactionCount += row._count._all;
      current.totalNetWeightKg = addStoredNets(current.totalNetWeightKg, row._sum.netWeightKg);
      if (!current.workflowClassification.includes(workflow)) {
        current.workflowClassification = `${current.workflowClassification}, ${workflow}`;
      }
      if (current.site !== siteName.get(row.siteId)) {
        current.site = "Multiple accessible sites";
      }
    } else {
      rolled.set(key, {
        materialId: row.materialId,
        material: row.materialId ? (materialName.get(row.materialId) ?? "Unknown material") : "Unassigned",
        transactionCount: row._count._all,
        totalGrossWeightKg: weights.gross,
        totalTareWeightKg: weights.tare,
        totalNetWeightKg: storedNetLabel(row._sum.netWeightKg),
        workflowClassification: workflow,
        configuredWorkflow,
        site: siteName.get(row.siteId) ?? "Unknown site",
      });
    }
  }

  const items = [...rolled.values()].sort((left, right) => right.transactionCount - left.transactionCount);
  return { items, meta: reportMetaFor(ctx, items.length === 0) };
}

export async function reportVehiclesAnalytics(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "vehicles");
  const where = scopedTransactionWhere(actor, ctx.filters);
  const groups = await prisma.transaction.groupBy({
    by: ["vehicleId"],
    where,
    _count: { _all: true },
    _sum: { netWeightKg: true },
    _min: { arrivedAt: true },
    _max: { arrivedAt: true },
  });
  const vehicleIds = groups.map((row) => row.vehicleId).filter((id): id is string => id !== null);
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds } },
    select: { id: true, displayRegistrationNumber: true },
  });
  const names = new Map(vehicles.map((item) => [item.id, item.displayRegistrationNumber]));
  const items = groups.map((row) => ({
    vehicleId: row.vehicleId,
    vehicleNumber: row.vehicleId ? (names.get(row.vehicleId) ?? "Unknown vehicle") : "Unidentified",
    transactionCount: row._count._all,
    totalNetWeightKg: storedNetLabel(row._sum.netWeightKg),
    totalMaterialHandledKg: storedNetLabel(row._sum.netWeightKg),
    firstTransactionAt: row._min.arrivedAt?.toISOString() ?? null,
    lastTransactionAt: row._max.arrivedAt?.toISOString() ?? null,
  }));
  return { items, meta: reportMetaFor(ctx, items.length === 0) };
}

export async function reportSuppliers(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "suppliers");
  const where = scopedTransactionWhere(actor, ctx.filters);
  const groups = await prisma.transaction.groupBy({
    by: ["supplierId"],
    where: { ...where, supplierId: { not: null } },
    _count: { _all: true },
    _sum: { netWeightKg: true },
  });
  if (groups.length === 0) {
    return { items: [], meta: emptyMeta(ctx) };
  }
  const supplierIds = groups.map((row) => row.supplierId).filter((id): id is string => id !== null);
  const pairs = await prisma.transaction.groupBy({
    by: ["supplierId", "materialId"],
    where: { ...where, supplierId: { in: supplierIds } },
  });
  const materialIds = [...new Set(pairs.map((row) => row.materialId).filter((id): id is string => id !== null))];
  const [suppliers, materials] = await Promise.all([
    prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, code: true } }),
    prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, name: true, code: true } }),
  ]);
  const supplierName = new Map(suppliers.map((item) => [item.id, item.code ? `${item.name} (${item.code})` : item.name]));
  const materialName = new Map(materials.map((item) => [item.id, item.name]));
  const materialsBySupplier = new Map<string, string[]>();
  for (const pair of pairs) {
    if (!pair.supplierId) {
      continue;
    }
    const list = materialsBySupplier.get(pair.supplierId) ?? [];
    list.push(pair.materialId ? (materialName.get(pair.materialId) ?? "Unknown material") : "Unassigned");
    materialsBySupplier.set(pair.supplierId, list);
  }
  const items = groups.map((row) => ({
    supplierId: row.supplierId,
    supplier: row.supplierId ? (supplierName.get(row.supplierId) ?? "Unknown supplier") : "Unassigned",
    transactionCount: row._count._all,
    totalNetWeightKg: storedNetLabel(row._sum.netWeightKg),
    materials: [...new Set(materialsBySupplier.get(row.supplierId ?? "") ?? [])],
    from: ctx.dates.fromYmd ?? null,
    to: ctx.dates.toYmd ?? null,
  }));
  return { items, meta: reportMetaFor(ctx, items.length === 0) };
}

export async function reportWeighbridges(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "weighbridges");
  const where = scopedTransactionWhere(actor, ctx.filters);
  const siteScope = accessibleSiteIds(actor);
  const [
    groups,
    completed,
    exceptionGroups,
    anomalyGroups,
    txDuration,
    weighDuration,
    hardware,
    snapshots,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["weighbridgeId"],
      where,
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["weighbridgeId"],
      where: completedWhere(where),
      _count: { _all: true },
    }),
    prisma.transaction.groupBy({
      by: ["weighbridgeId"],
      where: exceptionWhere(where),
      _count: { _all: true },
    }),
    prisma.weightAnomalyEvent.groupBy({
      by: ["weighbridgeId"],
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteScope ? { siteId: { in: siteScope } } : {}),
        ...(ctx.filters.weighbridgeId ? { weighbridgeId: ctx.filters.weighbridgeId } : {}),
        ...(ctx.filters.from || ctx.filters.to
          ? {
              firstDetectedAt: {
                ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
                ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    }),
    sqlAverageTransactionDurationByWeighbridge(actor, ctx.filters),
    sqlAverageWeighmentDurationByWeighbridge(actor, ctx.filters),
    prisma.weighbridgeHardwareProfile.findMany({
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteScope ? { siteId: { in: siteScope } } : {}),
        ...(ctx.filters.weighbridgeId ? { weighbridgeId: ctx.filters.weighbridgeId } : {}),
      },
      select: { weighbridgeId: true, lastStatus: true, lastError: true },
    }),
    prisma.edgeSyncSnapshot.findMany({
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteScope ? { siteId: { in: siteScope } } : {}),
      },
      select: { siteId: true, connectivityState: true, gatewayId: true },
    }),
  ]);

  const weighbridgeIds = [
    ...new Set(
      [...groups, ...completed, ...exceptionGroups, ...anomalyGroups]
        .map((row) => row.weighbridgeId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const weighbridges = await prisma.weighbridge.findMany({
    where: { id: { in: weighbridgeIds } },
    select: { id: true, code: true, name: true, siteId: true, isActive: true },
  });
  const names = new Map(weighbridges.map((item) => [item.id, item]));
  const completedMap = new Map(completed.map((row) => [row.weighbridgeId ?? "none", row._count._all]));
  const exceptionMap = new Map(exceptionGroups.map((row) => [row.weighbridgeId ?? "none", row._count._all]));
  const anomalyMap = new Map(anomalyGroups.map((row) => [row.weighbridgeId, row._count._all]));
  const failureMap = new Map<string, number>();
  for (const profile of hardware) {
    if (
      profile.lastStatus === HardwareDeviceStatus.ERROR ||
      profile.lastStatus === HardwareDeviceStatus.DISCONNECTED
    ) {
      failureMap.set(profile.weighbridgeId, (failureMap.get(profile.weighbridgeId) ?? 0) + 1);
    }
  }

  const items = groups.map((row) => {
    const id = row.weighbridgeId ?? "none";
    const bridge = row.weighbridgeId ? names.get(row.weighbridgeId) : null;
    const txAvg = row.weighbridgeId ? txDuration.get(row.weighbridgeId) : undefined;
    const weighAvg = row.weighbridgeId ? weighDuration.get(row.weighbridgeId) : undefined;
    const offline = snapshots.filter(
      (snapshot) =>
        snapshot.connectivityState === "OFFLINE" && (!bridge || snapshot.siteId === bridge.siteId),
    ).length;
    return {
      weighbridgeId: row.weighbridgeId,
      weighbridge: bridge ? `${bridge.code} · ${bridge.name}` : "Unassigned",
      isActive: bridge?.isActive ?? false,
      transactionsProcessed: row._count._all,
      completedTransactions: completedMap.get(id) ?? 0,
      exceptions: exceptionMap.get(id) ?? 0,
      weightAnomalies: row.weighbridgeId ? (anomalyMap.get(row.weighbridgeId) ?? 0) : 0,
      averageTransactionDuration: txAvg
        ? { ...averageDuration([txAvg.avgMs]), sampleCount: txAvg.sampleCount }
        : { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" as const, sampleCount: 0 },
      averageWeighmentDuration: weighAvg
        ? { ...averageDuration([weighAvg.avgMs]), sampleCount: weighAvg.sampleCount }
        : { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" as const, sampleCount: 0 },
      offlineGatewaySnapshots: offline,
      deviceCommunicationFailures: row.weighbridgeId ? (failureMap.get(row.weighbridgeId) ?? 0) : 0,
    };
  });
  return { items, meta: reportMetaFor(ctx, items.length === 0) };
}

export async function reportWorkflow(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "workflow");
  const stages = [
    { id: "identification" as const, name: "Vehicle identification" },
    { id: "document" as const, name: "Document review" },
    { id: "approval" as const, name: "Approval" },
    { id: "unloading" as const, name: "Unloading" },
    { id: "final_weighment" as const, name: "Final weighment" },
    { id: "total" as const, name: "Total transaction" },
  ];
  const items = [];
  for (const stage of stages) {
    const result = await sqlStageAverageMs(actor, ctx.filters, stage.id);
    items.push({
      stage: stage.name,
      sampleCount: result.sampleCount,
      averageDurationMs: result.avgMs,
      averageDuration: result.avgMs === null ? INSUFFICIENT_DATA : formatDurationMs(result.avgMs),
      data: result.avgMs === null ? ("insufficient" as const) : ("actual" as const),
    });
  }
  return { items, meta: reportMetaFor(ctx, items.every((item) => item.data === "insufficient")) };
}

export async function reportApprovals(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "approvals");
  if (!resolveDashboardCapabilities(actor.user).reports) {
    throw new HttpError(403, "You do not have access to reports");
  }
  const where = await approvalAnalyticsWhere(actor, ctx.filters);
  const [byDecision, byDepartment, byWorkflow, approvalAvg] = await Promise.all([
    prisma.approval.groupBy({
      by: ["decision"],
      where,
      _count: { _all: true },
    }),
    prisma.approval.groupBy({
      by: ["departmentId"],
      where,
      _count: { _all: true },
    }),
    prisma.approval.groupBy({
      by: ["snapshotStepName"],
      where,
      _count: { _all: true },
    }),
    sqlStageAverageMs(actor, ctx.filters, "approval"),
  ]);

  const average =
    approvalAvg.avgMs === null
      ? { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" as const }
      : { milliseconds: approvalAvg.avgMs, label: formatDurationMs(approvalAvg.avgMs), data: "actual" as const };
  const departments = await prisma.department.findMany({
    where: { id: { in: byDepartment.map((row) => row.departmentId) } },
    select: { id: true, code: true, name: true },
  });
  const departmentName = new Map(departments.map((item) => [item.id, `${item.name} (${item.code})`]));
  const count = (decision: ApprovalDecision) => byDecision.find((row) => row.decision === decision)?._count._all ?? 0;
  const total = byDecision.reduce((sum, row) => sum + row._count._all, 0);

  return {
    pending: count(ApprovalDecision.PENDING),
    approved: count(ApprovalDecision.APPROVED),
    rejected: count(ApprovalDecision.REJECTED),
    averageApprovalTime: average,
    byDepartment: byDepartment.map((row) => ({
      department: departmentName.get(row.departmentId) ?? "Unknown department",
      count: row._count._all,
    })),
    byWorkflowStep: byWorkflow.map((row) => ({
      workflowStep: row.snapshotStepName,
      count: row._count._all,
    })),
    meta: reportMetaFor(ctx, total === 0),
  };
}

export async function reportExceptionsAnalytics(
  actor: ActorContext,
  query: Record<string, unknown>,
  options: { take?: number } = {},
) {
  const ctx = await reportContext(actor, query, "exceptions");
  const family = ctx.filters.exceptionFamily;
  if (family === "PROVIDER_EXCEPTION") {
    return providerExceptionReport(actor, ctx, options);
  }
  if (family === "SYNCHRONIZATION_EXCEPTION") {
    return syncExceptionReport(actor, ctx, options);
  }

  const where = exceptionFamilyWhere(scopedTransactionWhere(actor, ctx.filters), family);
  const take = options.take ?? ctx.pagination.pageSize;
  const skip = options.take ? 0 : ctx.pagination.skip;
  const [total, rows, statusGroups, providerCount, syncCount] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: dashboardTransactionInclude,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.operationalAlert.count({
      where: providerAlertWhere(actor, ctx.filters),
    }),
    prisma.edgeSyncConflict.count({
      where: syncConflictWhere(actor, ctx.filters),
    }),
  ]);

  const items = rows.map((row) => {
    const item = toDashboardException(row);
    const familyType = familyFromDashboardType(item.exceptionType);
    const resolution = durationBetween(row.createdAt, row.completedAt);
    return {
      exceptionType: familyType,
      detailType: item.exceptionType,
      transactionId: item.id,
      transaction: item.referenceNumber,
      site: item.site.name,
      weighbridge: item.weighbridge?.code ?? null,
      createdAt: item.createdAt,
      status: item.status,
      resolutionTime: resolution.label,
      resolutionStatus: item.status,
      message: item.message,
    };
  });

  const summary = [
    ...statusGroups.map((row) => ({
      exceptionType: row.status === TransactionStatus.EXCEPTION ? "WEIGHT_EXCEPTION" : "WORKFLOW_EXCEPTION",
      count: row._count._all,
      status: row.status,
      lastDate: row._max.updatedAt?.toISOString() ?? null,
    })),
    ...(providerCount > 0
      ? [{ exceptionType: "PROVIDER_EXCEPTION", count: providerCount, status: "OPEN", lastDate: null as string | null }]
      : []),
    ...(syncCount > 0
      ? [{ exceptionType: "SYNCHRONIZATION_EXCEPTION", count: syncCount, status: "OPEN", lastDate: null as string | null }]
      : []),
  ];

  return {
    items,
    summary,
    page: ctx.pagination.page,
    pageSize: take,
    total,
    meta: reportMetaFor(ctx, total === 0 && providerCount === 0 && syncCount === 0),
  };
}

export async function reportAnomalies(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "anomalies");
  const result = await listWeightAnomalies(actor, {
    ...query,
    ...(ctx.filters.from ? { from: ctx.filters.from.toISOString() } : {}),
    ...(ctx.filters.to ? { to: ctx.filters.to.toISOString() } : {}),
  });
  const items = result.items.map((item) => ({
    id: item.id,
    label: "Weight anomaly",
    caveat: "Possible weighing-system issue. This is not a confirmed fraud finding.",
    type: item.type,
    transactionId: item.transactionId,
    transaction: item.transactionReference,
    deviceId: item.deviceId,
    weighbridge: item.weighbridge.code,
    observedWeightKg: item.observedWeightKg,
    previousWeightKg: item.previousWeightKg,
    timestamp: item.firstDetectedAt,
    severity: item.severity,
    status: item.status,
    resolution: item.resolvedAt ?? item.reviewReason ?? (item.status === WeightAnomalyStatus.OPEN ? "Open" : item.status),
  }));
  return {
    items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    meta: reportMetaFor(ctx, result.total === 0),
  };
}

export async function reportSync(actor: ActorContext, query: Record<string, unknown>) {
  const ctx = await reportContext(actor, query, "sync");
  const siteIds = accessibleSiteIds(actor);
  const gatewayWhere: Prisma.EdgeGatewayWhereInput = {
    organizationId: actor.user.organizationId,
    ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
  };
  const [gateways, snapshots, deadLetters, ingest, offlineAudits] = await Promise.all([
    prisma.edgeGateway.findMany({
      where: gatewayWhere,
      select: { id: true, code: true, name: true, siteId: true, status: true, lastHeartbeatAt: true },
    }),
    prisma.edgeSyncSnapshot.findMany({
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
      },
    }),
    prisma.edgeDeadLetter.groupBy({
      by: ["gatewayId"],
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
        ...(ctx.filters.from || ctx.filters.to
          ? {
              lastFailureAt: {
                ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
                ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    }),
    prisma.edgeIngestedEvent.groupBy({
      by: ["gatewayId", "status"],
      where: {
        organizationId: actor.user.organizationId,
        ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
        ...(ctx.filters.from || ctx.filters.to
          ? {
              createdAt: {
                ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
                ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
              },
            }
          : {}),
      },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: {
        organizationId: actor.user.organizationId,
        action: { in: ["EDGE_OFFLINE_ENTERED", "EDGE_ONLINE_RESTORED"] },
        ...(ctx.filters.from || ctx.filters.to
          ? {
              occurredAt: {
                ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
                ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
              },
            }
          : {}),
      },
      select: { entityId: true, action: true, occurredAt: true },
      orderBy: { occurredAt: "asc" },
      take: 2000,
    }),
  ]);

  const snapshotByGateway = new Map(snapshots.map((row) => [row.gatewayId, row]));
  const deadByGateway = new Map(deadLetters.map((row) => [row.gatewayId, row._count._all]));
  const sessions = pairOfflineSessions(offlineAudits);

  const items = gateways.map((gateway) => {
    const snapshot = snapshotByGateway.get(gateway.id);
    const session = sessions.get(gateway.id);
    const generated = ingest.filter((row) => row.gatewayId === gateway.id).reduce((sum, row) => sum + row._count._all, 0);
    const synced = ingest
      .filter((row) => row.gatewayId === gateway.id && row.status === "PROCESSED")
      .reduce((sum, row) => sum + row._count._all, 0);
    const failed = ingest
      .filter((row) => row.gatewayId === gateway.id && row.status === "REJECTED")
      .reduce((sum, row) => sum + row._count._all, 0);
    return {
      gatewayId: gateway.id,
      gateway: `${gateway.code} · ${gateway.name}`,
      connectivityState: snapshot?.connectivityState ?? gateway.status,
      queued: snapshot?.queued ?? 0,
      syncing: snapshot?.syncing ?? 0,
      eventsGenerated: generated,
      eventsSynchronized: synced,
      failedEvents: failed,
      deadLetterEvents: deadByGateway.get(gateway.id) ?? snapshot?.deadLetter ?? 0,
      lastSuccessfulSyncAt: snapshot?.lastSuccessfulSyncAt?.toISOString() ?? null,
      offlineDuration: session ?? { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" as const },
      synchronizationDuration:
        snapshot?.lastSuccessfulSyncAt && snapshot.updatedAt
          ? durationBetween(snapshot.lastSuccessfulSyncAt, snapshot.updatedAt)
          : { milliseconds: null, label: INSUFFICIENT_DATA, data: "insufficient" as const },
    };
  });
  return { items, meta: reportMetaFor(ctx, items.length === 0) };
}

export async function reportDaily(actor: ActorContext, query: Record<string, unknown>) {
  const withPreset = query.datePreset || query.from ? query : { ...query, datePreset: "today" };
  const ctx = await reportContext(actor, withPreset, "daily");
  const where = scopedTransactionWhere(actor, ctx.filters);
  const siteIds = accessibleSiteIds(actor);
  const anomalyWhere: Prisma.WeightAnomalyEventWhereInput = {
    organizationId: actor.user.organizationId,
    ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    ...(ctx.filters.weighbridgeId ? { weighbridgeId: ctx.filters.weighbridgeId } : {}),
    ...(ctx.filters.from || ctx.filters.to
      ? {
          firstDetectedAt: {
            ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
            ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
          },
        }
      : {}),
  };
  const gateways = await prisma.edgeGateway.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(ctx.filters.siteId ? { siteId: ctx.filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    },
    select: { id: true },
  });
  const [
    totalTransactions,
    completed,
    pending,
    exceptions,
    net,
    vehicles,
    approvals,
    anomalies,
    offlineEvents,
  ] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.count({ where: completedWhere(where) }),
    prisma.transaction.count({ where: liveWhere(where) }),
    prisma.transaction.count({ where: exceptionWhere(where) }),
    prisma.transaction.aggregate({ where: completedWhere(where), _sum: { netWeightKg: true } }),
    prisma.transaction.groupBy({
      by: ["vehicleId"],
      where: { ...where, vehicleId: { not: null } },
    }),
    prisma.approval.count({ where: await approvalAnalyticsWhere(actor, ctx.filters) }),
    prisma.weightAnomalyEvent.count({ where: anomalyWhere }),
    prisma.auditLog.count({
      where: {
        organizationId: actor.user.organizationId,
        action: "EDGE_OFFLINE_ENTERED",
        ...(gateways.length > 0 ? { entityId: { in: gateways.map((row) => row.id) } } : { id: "__none__" }),
        ...(ctx.filters.from || ctx.filters.to
          ? {
              occurredAt: {
                ...(ctx.filters.from ? { gte: ctx.filters.from } : {}),
                ...(ctx.filters.to ? { lte: ctx.filters.to } : {}),
              },
            }
          : {}),
      },
    }),
  ]);

  const empty = totalTransactions === 0;
  return {
    date: periodLabel(ctx.dates.fromYmd, ctx.dates.toYmd),
    vehiclesProcessed: empty ? null : vehicles.length,
    totalTransactions: empty ? null : totalTransactions,
    completed: empty ? null : completed,
    pending: empty ? null : pending,
    exceptions: empty ? null : exceptions,
    totalNetWeightKg: empty ? null : storedNetLabel(net._sum.netWeightKg),
    approvals: empty ? null : approvals,
    weightAnomalies: empty ? null : anomalies,
    offlineEvents: empty ? null : offlineEvents,
    meta: reportMetaFor(ctx, empty),
  };
}

export async function reportCatalogPayload() {
  return {
    reports: REPORT_CATALOG,
    datePresets: REPORT_DATE_PRESETS,
    exceptionFamilies: EXCEPTION_FAMILIES,
    emptyMessage: EMPTY_REPORT_MESSAGE,
    insufficientData: INSUFFICIENT_DATA,
  };
}

export async function enhancedDashboardCharts(
  actor: ActorContext,
  base: DashboardFilterInput,
  timeZone: string,
) {
  const siteScope = accessibleSiteIds(actor);
  const where = scopedTransactionWhere(actor, base);
  const [siteGroups, exceptionCount, approvalGroups, snapshots, daily] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["siteId"],
      where,
      _count: { _all: true },
    }),
    prisma.transaction.count({ where: exceptionWhere(where) }),
    prisma.approval.groupBy({
      by: ["decision"],
      where: await approvalAnalyticsWhere(actor, base),
      _count: { _all: true },
    }),
    prisma.edgeSyncSnapshot.groupBy({
      by: ["connectivityState"],
      where: {
        organizationId: actor.user.organizationId,
        ...(base.siteId ? { siteId: base.siteId } : siteScope ? { siteId: { in: siteScope } } : {}),
      },
      _count: { _all: true },
    }),
    sqlDailyTransactionAggregates(actor, base, timeZone),
  ]);
  const sites = await prisma.site.findMany({
    where: { id: { in: siteGroups.map((row) => row.siteId) } },
    select: { id: true, name: true },
  });
  const siteName = new Map(sites.map((item) => [item.id, item.name]));
  return {
    bySite: siteGroups
      .map((row) => ({ label: siteName.get(row.siteId) ?? row.siteId, value: row._count._all }))
      .sort((left, right) => right.value - left.value),
    exceptionCount: [{ label: "Exceptions", value: exceptionCount }],
    approvalStatus: approvalGroups.map((row) => ({ label: row.decision, value: row._count._all })),
    gatewayStatus: snapshots.map((row) => ({ label: row.connectivityState, value: row._count._all })),
    netWeightByDay: daily.map((row) => ({ label: row.day, value: Number(row.netWeightKg) })),
    dailyVolumeActual: daily.map((row) => ({ label: row.day, value: row.transactionCount })),
  };
}

async function providerExceptionReport(
  actor: ActorContext,
  ctx: Awaited<ReturnType<typeof reportContext>>,
  options: { take?: number },
) {
  const where = providerAlertWhere(actor, ctx.filters);
  const take = options.take ?? ctx.pagination.pageSize;
  const skip = options.take ? 0 : ctx.pagination.skip;
  const [total, rows] = await prisma.$transaction([
    prisma.operationalAlert.count({ where }),
    prisma.operationalAlert.findMany({
      where,
      include: {
        site: { select: { name: true } },
        transaction: { select: { id: true, referenceNumber: true, weighbridge: { select: { code: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      exceptionType: "PROVIDER_EXCEPTION" as const,
      detailType: row.type,
      transactionId: row.transactionId,
      transaction: row.transaction?.referenceNumber ?? null,
      site: row.site.name,
      weighbridge: row.transaction?.weighbridge?.code ?? null,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      resolutionTime: durationBetween(row.createdAt, row.resolvedAt).label,
      resolutionStatus: row.status,
      message: row.message,
    })),
    summary: [{ exceptionType: "PROVIDER_EXCEPTION", count: total, status: "OPEN", lastDate: rows[0]?.createdAt.toISOString() ?? null }],
    page: ctx.pagination.page,
    pageSize: take,
    total,
    meta: reportMetaFor(ctx, total === 0),
  };
}

async function syncExceptionReport(
  actor: ActorContext,
  ctx: Awaited<ReturnType<typeof reportContext>>,
  options: { take?: number },
) {
  const where = syncConflictWhere(actor, ctx.filters);
  const take = options.take ?? ctx.pagination.pageSize;
  const skip = options.take ? 0 : ctx.pagination.skip;
  const [total, rows] = await prisma.$transaction([
    prisma.edgeSyncConflict.count({ where }),
    prisma.edgeSyncConflict.findMany({
      where,
      include: {
        site: { select: { name: true } },
        transaction: { select: { id: true, referenceNumber: true, weighbridge: { select: { code: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      exceptionType: "SYNCHRONIZATION_EXCEPTION" as const,
      detailType: row.reason,
      transactionId: row.transactionId,
      transaction: row.transaction?.referenceNumber ?? null,
      site: row.site.name,
      weighbridge: row.transaction?.weighbridge?.code ?? null,
      createdAt: row.createdAt.toISOString(),
      status: row.status,
      resolutionTime: durationBetween(row.createdAt, row.resolvedAt).label,
      resolutionStatus: row.status,
      message: row.reason,
    })),
    summary: [
      { exceptionType: "SYNCHRONIZATION_EXCEPTION", count: total, status: "OPEN", lastDate: rows[0]?.createdAt.toISOString() ?? null },
    ],
    page: ctx.pagination.page,
    pageSize: take,
    total,
    meta: reportMetaFor(ctx, total === 0),
  };
}

function providerAlertWhere(actor: ActorContext, filters: DashboardFilterInput): Prisma.OperationalAlertWhereInput {
  const siteIds = accessibleSiteIds(actor);
  return {
    organizationId: actor.user.organizationId,
    type: { in: [...PROVIDER_ALERT_TYPES] },
    ...(filters.siteId ? { siteId: filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

function syncConflictWhere(actor: ActorContext, filters: DashboardFilterInput): Prisma.EdgeSyncConflictWhereInput {
  const siteIds = accessibleSiteIds(actor);
  return {
    organizationId: actor.user.organizationId,
    ...(filters.siteId ? { siteId: filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

async function approvalAnalyticsWhere(
  actor: ActorContext,
  filters: DashboardFilterInput,
): Promise<Prisma.ApprovalWhereInput> {
  const siteIds = accessibleSiteIds(actor);
  const where: Prisma.ApprovalWhereInput = {
    organizationId: actor.user.organizationId,
    ...(filters.siteId ? { siteId: filters.siteId } : siteIds ? { siteId: { in: siteIds } } : {}),
    ...(filters.from || filters.to
      ? {
          requestedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.materialId || filters.workflowCode
      ? {
          transaction: {
            ...(filters.materialId ? { materialId: filters.materialId } : {}),
            ...(filters.workflowCode
              ? {
                  OR: [
                    { workflowDefinition: { is: { code: filters.workflowCode } } },
                    { workflowSnapshot: { path: ["workflow", "code"], equals: filters.workflowCode } },
                  ],
                }
              : {}),
          },
        }
      : {}),
  };
  return where;
}

function pairOfflineSessions(
  rows: Array<{ entityId: string; action: string; occurredAt: Date }>,
): Map<string, ReturnType<typeof durationBetween>> {
  const open = new Map<string, Date>();
  const result = new Map<string, ReturnType<typeof durationBetween>>();
  for (const row of rows) {
    if (row.action === "EDGE_OFFLINE_ENTERED") {
      open.set(row.entityId, row.occurredAt);
    } else if (row.action === "EDGE_ONLINE_RESTORED") {
      const started = open.get(row.entityId);
      result.set(row.entityId, durationBetween(started ?? null, row.occurredAt));
      open.delete(row.entityId);
    }
  }
  return result;
}

type ReportContext = {
  filters: DashboardFilterInput;
  dates: ReturnType<typeof parseReportFilters>["dates"];
  pagination: ReturnType<typeof parseDashboardPagination>;
  timeZone: string;
};

export async function reportContext(actor: ActorContext, query: Record<string, unknown>, reportId: ReportId): Promise<ReportContext> {
  if (!resolveDashboardCapabilities(actor.user).reports) {
    throw new HttpError(403, "You do not have access to reports");
  }
  const timeZone = await resolveReportTimezone(actor, query);
  const parsed = parseReportFilters(query, timeZone);
  await assertRequestedScope(actor, {
    siteId: parsed.filters.siteId,
    weighbridgeId: parsed.filters.weighbridgeId,
  });
  const pagination = parseDashboardPagination(query);
  await auditReportAccess(actor, reportId, parsed.dates, parsed.filters);
  return { filters: parsed.filters, dates: parsed.dates, pagination, timeZone };
}

async function auditReportAccess(
  actor: ActorContext,
  reportId: ReportId,
  dates: ReturnType<typeof parseReportFilters>["dates"],
  filters: DashboardFilterInput,
): Promise<void> {
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.REPORT_GENERATED,
    entityType: "Report",
    entityId: reportId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      reportId,
      from: dates.fromYmd ?? null,
      to: dates.toYmd ?? null,
      siteId: filters.siteId ?? null,
      datePreset: dates.preset,
    },
  });
  if (dates.isLargeHistorical) {
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.LARGE_REPORT_REQUESTED,
      entityType: "Report",
      entityId: reportId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { reportId, daySpan: dates.daySpan, siteId: filters.siteId ?? null },
    });
  }
}

export function reportMetaFor(ctx: ReportContext, empty: boolean): ReportMeta {
  return {
    empty,
    emptyMessage: empty ? EMPTY_REPORT_MESSAGE : null,
    timezone: ctx.timeZone,
    from: ctx.dates.fromYmd ?? null,
    to: ctx.dates.toYmd ?? null,
    datePreset: ctx.dates.preset,
    netWeightSource: "transaction.netWeightKg",
  };
}

function periodLabel(fromYmd?: string, toYmd?: string): string | null {
  if (fromYmd && toYmd) {
    return fromYmd === toYmd ? fromYmd : `${fromYmd} → ${toYmd}`;
  }
  return fromYmd ?? toYmd ?? null;
}

function storedNetLabel(value: { toString(): string } | null | undefined): string {
  return value == null ? INSUFFICIENT_DATA : value.toString();
}

function addStoredNets(current: string, addition: { toString(): string } | null | undefined): string {
  if (addition == null) {
    return current;
  }
  const added = addition.toString();
  if (current === INSUFFICIENT_DATA) {
    return added;
  }
  return milligramsToKgDecimal(kgToMilligrams(current) + kgToMilligrams(added));
}

function emptyMeta(ctx: ReportContext): ReportMeta {
  return reportMetaFor(ctx, true);
}
