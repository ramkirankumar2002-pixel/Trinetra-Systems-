import type { Prisma } from "@prisma/client";
import { ACTIVE_MAINTENANCE_STATUSES, OPEN_TICKET_STATUSES } from "../../domain/support/index.js";
import { parsePagination } from "../../domain/pagination.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedScope } from "../shared/siteScope.js";
import { hasPermission, supportSiteWhere } from "./scope.js";
import { toPublicMaintenance, toPublicTicketSummary } from "./mapper.js";

export async function supportDashboard(
  actor: ActorContext,
  query: {
    siteId?: string | undefined;
    weighbridgeId?: string | undefined;
    deviceId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
  },
) {
  await assertRequestedScope(actor, { siteId: query.siteId, weighbridgeId: query.weighbridgeId });
  const ticketWhere: Prisma.SupportTicketWhereInput = {
    organizationId: actor.user.organizationId,
    ...supportSiteWhere(actor),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.weighbridgeId ? { weighbridgeId: query.weighbridgeId } : {}),
    ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          },
        }
      : {}),
  };
  const maintenanceWhere: Prisma.ServiceMaintenanceRecordWhereInput = {
    organizationId: actor.user.organizationId,
    ...supportSiteWhere(actor),
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.weighbridgeId ? { weighbridgeId: query.weighbridgeId } : {}),
    ...(query.deviceId ? { deviceId: query.deviceId } : {}),
  };

  const [
    openTickets,
    criticalTickets,
    awaitingResponse,
    inProgress,
    resolvedTickets,
    activeMaintenance,
    recentlyCompleted,
    devicesWithIssues,
    unresolvedHighPriority,
  ] = await prisma.$transaction([
    prisma.supportTicket.count({ where: { ...ticketWhere, status: { in: OPEN_TICKET_STATUSES } } }),
    prisma.supportTicket.count({
      where: { ...ticketWhere, priority: "CRITICAL", status: { in: OPEN_TICKET_STATUSES } },
    }),
    prisma.supportTicket.count({ where: { ...ticketWhere, status: "WAITING_FOR_CUSTOMER" } }),
    prisma.supportTicket.count({ where: { ...ticketWhere, status: "IN_PROGRESS" } }),
    prisma.supportTicket.count({ where: { ...ticketWhere, status: "RESOLVED" } }),
    prisma.serviceMaintenanceRecord.count({
      where: { ...maintenanceWhere, status: { in: ACTIVE_MAINTENANCE_STATUSES } },
    }),
    prisma.serviceMaintenanceRecord.findMany({
      where: { ...maintenanceWhere, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 8,
      include: {
        site: { select: { id: true, code: true, name: true } },
        performedByUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        gateway: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
        ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
        maintenanceEvent: {
          select: { id: true, status: true, startedAt: true, endedAt: true, reason: true, startedByUserId: true },
        },
      },
    }),
    prisma.supportTicket.groupBy({
      by: ["deviceId"],
      where: { ...ticketWhere, deviceId: { not: null }, status: { in: OPEN_TICKET_STATUSES } },
      _count: { _all: true },
      orderBy: { deviceId: "asc" },
    }),
    prisma.supportTicket.findMany({
      where: {
        ...ticketWhere,
        priority: { in: ["HIGH", "CRITICAL"] },
        status: { in: OPEN_TICKET_STATUSES },
      },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 10,
      include: {
        site: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const deviceIds = devicesWithIssues.map((row) => row.deviceId).filter((id): id is string => id !== null);
  const devices = deviceIds.length
    ? await prisma.edgeDevice.findMany({
        where: { id: { in: deviceIds }, organizationId: actor.user.organizationId },
        select: { id: true, code: true, name: true, status: true, siteId: true },
      })
    : [];
  const deviceMap = new Map(devices.map((device) => [device.id, device]));

  const activeItems = await prisma.serviceMaintenanceRecord.findMany({
    where: { ...maintenanceWhere, status: { in: ACTIVE_MAINTENANCE_STATUSES } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      site: { select: { id: true, code: true, name: true } },
      performedByUser: { select: { id: true, fullName: true, email: true } },
      weighbridge: { select: { id: true, code: true, name: true } },
      gateway: { select: { id: true, code: true, name: true } },
      device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
      ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
      maintenanceEvent: {
        select: { id: true, status: true, startedAt: true, endedAt: true, reason: true, startedByUserId: true },
      },
    },
  });

  return {
    kpis: {
      openTickets,
      criticalTickets,
      awaitingResponse,
      inProgress,
      resolvedTickets,
      activeMaintenance,
    },
    activeMaintenance: activeItems.map(toPublicMaintenance),
    recentlyCompletedMaintenance: recentlyCompleted.map(toPublicMaintenance),
    devicesWithRecentIssues: devicesWithIssues.flatMap((row) => {
      if (!row.deviceId) {
        return [];
      }
      const device = deviceMap.get(row.deviceId);
      if (!device) {
        return [];
      }
      return [{ ...device, openTickets: row._count._all }];
    }),
    unresolvedHighPriority: unresolvedHighPriority.map(toPublicTicketSummary),
  };
}

export async function deviceServiceHistory(actor: ActorContext, deviceId: string) {
  requireHistoryRead(actor);
  const device = await prisma.edgeDevice.findFirst({
    where: { id: deviceId, organizationId: actor.user.organizationId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      gateway: { select: { id: true, code: true, name: true, status: true } },
      weighbridge: { select: { id: true, code: true, name: true } },
      commissioningTests: { orderBy: { updatedAt: "desc" }, take: 20 },
    },
  });
  if (!device) {
    throw new HttpError(404, "Device not found");
  }
  assertSiteAccess(actor.user, device.siteId);

  const pagination = parsePagination({ page: 1, pageSize: 20 });
  const [tickets, maintenance, alerts] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where: { organizationId: actor.user.organizationId, deviceId: device.id, ...supportSiteWhere(actor) },
      orderBy: { createdAt: "desc" },
      take: pagination.pageSize,
      include: {
        site: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.serviceMaintenanceRecord.findMany({
      where: { organizationId: actor.user.organizationId, deviceId: device.id, ...supportSiteWhere(actor) },
      orderBy: { createdAt: "desc" },
      take: pagination.pageSize,
      include: {
        site: { select: { id: true, code: true, name: true } },
        performedByUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        gateway: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
        ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
        maintenanceEvent: {
          select: { id: true, status: true, startedAt: true, endedAt: true, reason: true, startedByUserId: true },
        },
      },
    }),
    prisma.operationalAlert.findMany({
      where: { organizationId: actor.user.organizationId, entityId: device.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, title: true, severity: true, status: true, createdAt: true },
    }),
  ]);
  const [anomalies, windows] = device.weighbridgeId
    ? await prisma.$transaction([
        prisma.weightAnomalyEvent.findMany({
          where: { organizationId: actor.user.organizationId, weighbridgeId: device.weighbridgeId },
          orderBy: { firstDetectedAt: "desc" },
          take: 10,
          select: { id: true, type: true, title: true, status: true, severity: true, firstDetectedAt: true },
        }),
        prisma.maintenanceEvent.findMany({
          where: { organizationId: actor.user.organizationId, weighbridgeId: device.weighbridgeId },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: {
            id: true,
            status: true,
            reason: true,
            startedAt: true,
            endedAt: true,
            startedByUser: { select: { id: true, fullName: true } },
          },
        }),
      ])
    : [[], []];

  return {
    device: {
      id: device.id,
      code: device.code,
      name: device.name,
      status: device.status,
      installationStatus: device.installationStatus,
      manufacturer: device.manufacturer,
      model: device.model,
      serialNumber: device.serialNumber,
      lastError: device.lastError,
      lastCommunicationAt: device.lastCommunicationAt?.toISOString() ?? null,
      site: device.site,
      gateway: device.gateway,
      weighbridge: device.weighbridge,
    },
    commissioningTests: device.commissioningTests.map((test) => ({
      id: test.id,
      testKey: test.testKey,
      testType: test.testType,
      result: test.result,
      testedAt: test.testedAt?.toISOString() ?? null,
      notes: test.notes,
    })),
    tickets: tickets.map(toPublicTicketSummary),
    maintenance: maintenance.map(toPublicMaintenance),
    recentAlerts: alerts.map((alert) => ({ ...alert, createdAt: alert.createdAt.toISOString() })),
    recentAnomalies: anomalies.map((item) => ({ ...item, firstDetectedAt: item.firstDetectedAt.toISOString() })),
    maintenanceWindows: windows.map((item) => ({
      id: item.id,
      status: item.status,
      reason: item.reason,
      startedAt: item.startedAt.toISOString(),
      endedAt: item.endedAt?.toISOString() ?? null,
      startedBy: item.startedByUser,
    })),
  };
}

export async function weighbridgeServiceHistory(actor: ActorContext, weighbridgeId: string) {
  requireHistoryRead(actor);
  await assertRequestedScope(actor, { weighbridgeId });
  const weighbridge = await prisma.weighbridge.findFirst({
    where: { id: weighbridgeId, organizationId: actor.user.organizationId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      hardwareProfile: { select: { lastStatus: true, lastError: true, lastConnectedAt: true, enabled: true } },
    },
  });
  if (!weighbridge) {
    throw new HttpError(404, "Weighbridge not found");
  }

  const [tickets, maintenance, windows, devices] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where: { organizationId: actor.user.organizationId, weighbridgeId, ...supportSiteWhere(actor) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        site: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.serviceMaintenanceRecord.findMany({
      where: { organizationId: actor.user.organizationId, weighbridgeId, ...supportSiteWhere(actor) },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        site: { select: { id: true, code: true, name: true } },
        performedByUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        gateway: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
        ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
        maintenanceEvent: {
          select: { id: true, status: true, startedAt: true, endedAt: true, reason: true, startedByUserId: true },
        },
      },
    }),
    prisma.maintenanceEvent.findMany({
      where: { organizationId: actor.user.organizationId, weighbridgeId },
      orderBy: { startedAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        reason: true,
        startedAt: true,
        endedAt: true,
        startedByUser: { select: { id: true, fullName: true } },
      },
    }),
    prisma.edgeDevice.findMany({
      where: { organizationId: actor.user.organizationId, weighbridgeId },
      select: { id: true, code: true, name: true, status: true, installationStatus: true },
    }),
  ]);

  return {
    weighbridge: {
      id: weighbridge.id,
      code: weighbridge.code,
      name: weighbridge.name,
      site: weighbridge.site,
      hardwareStatus: weighbridge.hardwareProfile?.lastStatus ?? null,
      hardwareEnabled: weighbridge.hardwareProfile?.enabled ?? null,
      lastError: weighbridge.hardwareProfile?.lastError ?? null,
    },
    devices,
    tickets: tickets.map(toPublicTicketSummary),
    maintenance: maintenance.map(toPublicMaintenance),
    maintenanceWindows: windows.map((item) => ({
      id: item.id,
      status: item.status,
      reason: item.reason,
      startedAt: item.startedAt.toISOString(),
      endedAt: item.endedAt?.toISOString() ?? null,
      startedBy: item.startedByUser,
    })),
  };
}

function requireHistoryRead(actor: ActorContext): void {
  if (
    !hasPermission(actor, "support.ticket.read") &&
    !hasPermission(actor, "support.maintenance.read") &&
    !hasPermission(actor, "weighbridge.read") &&
    !hasPermission(actor, "gateway.read")
  ) {
    throw new HttpError(403, "You do not have access to this resource");
  }
}
