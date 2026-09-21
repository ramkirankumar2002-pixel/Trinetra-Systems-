import { Prisma } from "@prisma/client";
import { assertMaintenanceTransition } from "../../domain/support/index.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { endMaintenance, startMaintenance } from "../anomalies/service.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedScope } from "../shared/siteScope.js";
import { maintenanceInclude, toPublicMaintenance } from "./mapper.js";
import { hasPermission, resolveLinkedAssets, supportSiteWhere } from "./scope.js";
import { addActivity, loadTicket, nextSupportNumber } from "./tickets.js";
import type {
  CompleteMaintenanceInput,
  CreateMaintenanceInput,
  MaintenanceListQuery,
  UpdateMaintenanceInput,
} from "./validators.js";

export async function listMaintenance(actor: ActorContext, query: MaintenanceListQuery) {
  requireRead(actor);
  await assertRequestedScope(actor, { siteId: query.siteId, weighbridgeId: query.weighbridgeId });
  const where = buildWhere(actor, query);
  const [total, items] = await prisma.$transaction([
    prisma.serviceMaintenanceRecord.count({ where }),
    prisma.serviceMaintenanceRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: query.pagination.skip,
      take: query.pagination.pageSize,
      include: maintenanceInclude,
    }),
  ]);
  return {
    items: items.map(toPublicMaintenance),
    page: query.pagination.page,
    pageSize: query.pagination.pageSize,
    total,
  };
}

export async function getMaintenance(actor: ActorContext, id: string) {
  requireRead(actor);
  return { maintenance: toPublicMaintenance(await loadMaintenance(actor, id)) };
}

export async function createMaintenance(actor: ActorContext, input: CreateMaintenanceInput) {
  requireManage(actor);
  const links = await resolveLinkedAssets(actor, input);
  if (input.ticketId) {
    await loadTicket(actor, input.ticketId);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const recordNumber = await nextSupportNumber(tx, actor.user.organizationId, "MNT");
        const record = await tx.serviceMaintenanceRecord.create({
          data: {
            organizationId: actor.user.organizationId,
            siteId: links.siteId,
            recordNumber,
            type: input.type,
            reason: input.reason,
            description: input.description,
            performedByUserId: actor.user.id,
            ticketId: input.ticketId ?? null,
            weighbridgeId: links.weighbridgeId,
            gatewayId: links.gatewayId,
            deviceId: links.deviceId,
            securityEventId: links.securityEventId,
            operationalAlertId: links.operationalAlertId,
          },
          include: maintenanceInclude,
        });
        await writeAudit(
          {
            organizationId: actor.user.organizationId,
            actorUserId: actor.user.id,
            action: AUDIT_ACTIONS.SERVICE_MAINTENANCE_CREATED,
            entityType: "ServiceMaintenanceRecord",
            entityId: record.id,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            metadata: {
              recordNumber,
              type: input.type,
              ticketId: input.ticketId ?? null,
              deviceId: links.deviceId,
              weighbridgeId: links.weighbridgeId,
            },
          },
          tx,
        );
        if (input.ticketId) {
          await addActivity(tx, actor, input.ticketId, {
            type: "MAINTENANCE",
            visibility: "CUSTOMER",
            description: `Maintenance ${recordNumber} created (${input.type}).`,
          });
        }
        return record;
      });

      if (input.startNow) {
        return startServiceMaintenance(actor, created.id);
      }
      return { maintenance: toPublicMaintenance(await loadMaintenance(actor, created.id)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new HttpError(500, "Unable to create a maintenance record number");
}

export async function updateMaintenance(actor: ActorContext, id: string, input: UpdateMaintenanceInput) {
  requireManage(actor);
  const existing = await loadMaintenance(actor, id);
  if (existing.status === "COMPLETED" || existing.status === "CANCELLED") {
    throw new HttpError(409, "Completed or cancelled maintenance cannot be edited");
  }
  const links = await resolveLinkedAssets(actor, {
    siteId: existing.siteId,
    weighbridgeId: input.weighbridgeId === undefined ? existing.weighbridgeId : input.weighbridgeId,
    gatewayId: input.gatewayId === undefined ? existing.gatewayId : input.gatewayId,
    deviceId: input.deviceId === undefined ? existing.deviceId : input.deviceId,
    ticketId: input.ticketId === undefined ? existing.ticketId : input.ticketId,
  });
  const deviceChanged =
    (input.deviceId !== undefined && input.deviceId !== existing.deviceId) ||
    (input.weighbridgeId !== undefined && input.weighbridgeId !== existing.weighbridgeId);

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.serviceMaintenanceRecord.update({
      where: { id: existing.id },
      data: {
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.findings !== undefined ? { findings: input.findings } : {}),
        ...(input.actionTaken !== undefined ? { actionTaken: input.actionTaken } : {}),
        ...(input.partsReplaced !== undefined ? { partsReplaced: input.partsReplaced } : {}),
        ...(input.beforeCondition !== undefined ? { beforeCondition: input.beforeCondition } : {}),
        ...(input.afterCondition !== undefined ? { afterCondition: input.afterCondition } : {}),
        weighbridgeId: links.weighbridgeId,
        gatewayId: links.gatewayId,
        deviceId: links.deviceId,
        ticketId: input.ticketId === undefined ? existing.ticketId : input.ticketId,
      },
      include: maintenanceInclude,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: deviceChanged
          ? AUDIT_ACTIONS.SERVICE_MAINTENANCE_DEVICE_CHANGED
          : AUDIT_ACTIONS.SERVICE_MAINTENANCE_CREATED,
        entityType: "ServiceMaintenanceRecord",
        entityId: record.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { deviceId: links.deviceId, weighbridgeId: links.weighbridgeId },
      },
      tx,
    );
    return record;
  });
  return { maintenance: toPublicMaintenance(updated) };
}

export async function startServiceMaintenance(actor: ActorContext, id: string) {
  requireManage(actor);
  const existing = await loadMaintenance(actor, id);
  assertMaintenanceTransition(existing.status, "IN_PROGRESS");
  const now = new Date();

  let maintenanceEventId = existing.maintenanceEventId;
  if (existing.weighbridgeId && hasPermission(actor, "maintenance.manage")) {
    const window = await startMaintenance(actor, existing.weighbridgeId, {
      reason: existing.reason,
    });
    maintenanceEventId = window.maintenance.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceMaintenanceRecord.update({
      where: { id: existing.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        performedByUserId: actor.user.id,
        maintenanceEventId,
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SERVICE_MAINTENANCE_STARTED,
        entityType: "ServiceMaintenanceRecord",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { maintenanceEventId, weighbridgeId: existing.weighbridgeId },
      },
      tx,
    );
    if (existing.ticketId) {
      await addActivity(tx, actor, existing.ticketId, {
        type: "MAINTENANCE",
        visibility: "CUSTOMER",
        description: `Maintenance ${existing.recordNumber} started.`,
      });
      await tx.supportTicket.update({
        where: { id: existing.ticketId },
        data: { status: "WAITING_FOR_MAINTENANCE" },
      });
    }
  });

  await safeEmitOperationalEvent({
    actor,
    type: "SUPPORT_MAINTENANCE_STARTED",
    organizationId: actor.user.organizationId,
    siteId: existing.siteId,
    title: `Maintenance ${existing.recordNumber} started`,
    message: existing.reason,
    eventKey: `support.maintenance.started:${existing.id}`,
    entityType: "ServiceMaintenanceRecord",
    entityId: existing.id,
  });

  return { maintenance: toPublicMaintenance(await loadMaintenance(actor, existing.id)) };
}

export async function completeServiceMaintenance(actor: ActorContext, id: string, input: CompleteMaintenanceInput) {
  requireManage(actor);
  const existing = await loadMaintenance(actor, id);
  assertMaintenanceTransition(existing.status, "COMPLETED");
  const now = new Date();

  if (existing.weighbridgeId && existing.maintenanceEventId && hasPermission(actor, "maintenance.manage")) {
    const openWindow = await prisma.maintenanceEvent.findFirst({
      where: { id: existing.maintenanceEventId, status: "ACTIVE" },
      select: { id: true },
    });
    if (openWindow) {
      await endMaintenance(actor, existing.weighbridgeId, { reason: input.findings ?? existing.findings ?? "Service completed" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceMaintenanceRecord.update({
      where: { id: existing.id },
      data: {
        status: "COMPLETED",
        endedAt: now,
        completedAt: now,
        findings: input.findings ?? existing.findings,
        actionTaken: input.actionTaken ?? existing.actionTaken,
        partsReplaced: input.partsReplaced ?? existing.partsReplaced,
        afterCondition: input.afterCondition ?? existing.afterCondition,
        performedByUserId: actor.user.id,
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SERVICE_MAINTENANCE_COMPLETED,
        entityType: "ServiceMaintenanceRecord",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { ticketId: existing.ticketId },
      },
      tx,
    );
    if (existing.ticketId) {
      await addActivity(tx, actor, existing.ticketId, {
        type: "MAINTENANCE",
        visibility: "CUSTOMER",
        description: `Maintenance ${existing.recordNumber} completed.`,
      });
    }
  });

  const extraRecipientUserIds: string[] = [];
  if (existing.ticketId) {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: existing.ticketId },
      select: { createdByUserId: true },
    });
    if (ticket) {
      extraRecipientUserIds.push(ticket.createdByUserId);
    }
  }

  await safeEmitOperationalEvent({
    actor,
    type: "SUPPORT_MAINTENANCE_COMPLETED",
    organizationId: actor.user.organizationId,
    siteId: existing.siteId,
    title: `Maintenance ${existing.recordNumber} completed`,
    message: existing.reason,
    eventKey: `support.maintenance.completed:${existing.id}`,
    entityType: "ServiceMaintenanceRecord",
    entityId: existing.id,
    extraRecipientUserIds,
  });

  return { maintenance: toPublicMaintenance(await loadMaintenance(actor, existing.id)) };
}

export async function cancelServiceMaintenance(actor: ActorContext, id: string) {
  requireManage(actor);
  const existing = await loadMaintenance(actor, id);
  assertMaintenanceTransition(existing.status, "CANCELLED");
  const now = new Date();

  if (existing.weighbridgeId && existing.maintenanceEventId && hasPermission(actor, "maintenance.manage")) {
    const openWindow = await prisma.maintenanceEvent.findFirst({
      where: { id: existing.maintenanceEventId, status: "ACTIVE" },
      select: { id: true },
    });
    if (openWindow) {
      await endMaintenance(actor, existing.weighbridgeId, { reason: "Service maintenance cancelled" });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.serviceMaintenanceRecord.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", endedAt: now },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SERVICE_MAINTENANCE_CANCELLED,
        entityType: "ServiceMaintenanceRecord",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {},
      },
      tx,
    );
    if (existing.ticketId) {
      await addActivity(tx, actor, existing.ticketId, {
        type: "MAINTENANCE",
        visibility: "CUSTOMER",
        description: `Maintenance ${existing.recordNumber} cancelled.`,
      });
    }
  });

  return { maintenance: toPublicMaintenance(await loadMaintenance(actor, existing.id)) };
}

export async function loadMaintenance(actor: ActorContext, id: string) {
  const record = await prisma.serviceMaintenanceRecord.findFirst({
    where: { id, organizationId: actor.user.organizationId, ...supportSiteWhere(actor) },
    include: maintenanceInclude,
  });
  if (!record) {
    const hidden = await prisma.serviceMaintenanceRecord.findFirst({
      where: { id },
      select: { organizationId: true, siteId: true },
    });
    if (hidden && hidden.organizationId === actor.user.organizationId) {
      throw new HttpError(403, "You do not have access to this resource");
    }
    throw new HttpError(404, "Maintenance record not found");
  }
  return record;
}

function buildWhere(actor: ActorContext, query: MaintenanceListQuery): Prisma.ServiceMaintenanceRecordWhereInput {
  const where: Prisma.ServiceMaintenanceRecordWhereInput = {
    organizationId: actor.user.organizationId,
    ...supportSiteWhere(actor),
  };
  if (query.siteId) where.siteId = query.siteId;
  if (query.weighbridgeId) where.weighbridgeId = query.weighbridgeId;
  if (query.deviceId) where.deviceId = query.deviceId;
  if (query.gatewayId) where.gatewayId = query.gatewayId;
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { recordNumber: { contains: query.q.toUpperCase(), mode: "insensitive" } },
      { reason: { contains: query.q, mode: "insensitive" } },
      { device: { is: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } } },
      { weighbridge: { is: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } } },
    ];
  }
  return where;
}

function requireRead(actor: ActorContext): void {
  if (!hasPermission(actor, "support.maintenance.read") && !hasPermission(actor, "support.maintenance.manage")) {
    throw new HttpError(403, "You do not have access to this resource");
  }
}

function requireManage(actor: ActorContext): void {
  if (!hasPermission(actor, "support.maintenance.manage")) {
    throw new HttpError(403, "You do not have access to this resource");
  }
}
