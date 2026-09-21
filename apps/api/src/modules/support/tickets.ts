import { Prisma } from "@prisma/client";
import {
  ACTIVE_MAINTENANCE_STATUSES,
  OPEN_TICKET_STATUSES,
  allowedTicketTransitions,
  assertTicketTransition,
  formatSupportNumber,
  parseSupportSequence,
  supportNumberPrefix,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "../../domain/support/index.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedScope } from "../shared/siteScope.js";
import { ticketInclude, toPublicTicket, toPublicTicketSummary, type PublicSupportTicket } from "./mapper.js";
import { hasPermission, resolveLinkedAssets, supportSiteWhere } from "./scope.js";
import type {
  AssignTicketInput,
  CreateTicketInput,
  StatusTransitionInput,
  TicketCommentInput,
  TicketListQuery,
  UpdateTicketInput,
} from "./validators.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function ticketAccess(actor: ActorContext) {
  return {
    canManage: hasPermission(actor, "support.ticket.manage"),
    canComment: hasPermission(actor, "support.ticket.comment"),
    canSeeInternal: hasPermission(actor, "support.internal"),
  };
}

export async function listTickets(actor: ActorContext, query: TicketListQuery) {
  await assertRequestedScope(actor, { siteId: query.siteId, weighbridgeId: query.weighbridgeId });
  const where = buildTicketWhere(actor, query);
  const [total, items] = await prisma.$transaction([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: query.pagination.skip,
      take: query.pagination.pageSize,
      include: {
        site: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, fullName: true, email: true } },
        weighbridge: { select: { id: true, code: true, name: true } },
        device: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  return {
    items: items.map(toPublicTicketSummary),
    page: query.pagination.page,
    pageSize: query.pagination.pageSize,
    total,
  };
}

export async function getTicket(actor: ActorContext, id: string): Promise<{ ticket: PublicSupportTicket }> {
  const ticket = await loadTicket(actor, id);
  return { ticket: toPublicTicket(ticket, ticketAccess(actor)) };
}

export async function createTicket(actor: ActorContext, input: CreateTicketInput) {
  const links = await resolveLinkedAssets(actor, input);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const ticketNumber = await nextSupportNumber(tx, actor.user.organizationId, "SUP");
        const ticket = await tx.supportTicket.create({
          data: {
            organizationId: actor.user.organizationId,
            siteId: links.siteId,
            ticketNumber,
            category: input.category,
            priority: input.priority,
            subject: input.subject,
            description: input.description,
            createdByUserId: actor.user.id,
            weighbridgeId: links.weighbridgeId,
            gatewayId: links.gatewayId,
            deviceId: links.deviceId,
            transactionId: links.transactionId,
            securityEventId: links.securityEventId,
            operationalAlertId: links.operationalAlertId,
            weightAnomalyEventId: links.weightAnomalyEventId,
          },
          include: ticketInclude,
        });
        await addActivity(tx, actor, ticket.id, {
          type: "COMMENT",
          visibility: "CUSTOMER",
          description: "Ticket created.",
        });
        await writeAudit(
          {
            organizationId: actor.user.organizationId,
            actorUserId: actor.user.id,
            action: AUDIT_ACTIONS.SUPPORT_TICKET_CREATED,
            entityType: "SupportTicket",
            entityId: ticket.id,
            ipAddress: actor.ipAddress,
            userAgent: actor.userAgent,
            metadata: { ticketNumber, category: input.category, priority: input.priority, siteId: links.siteId },
          },
          tx,
        );
        return ticket;
      });

      await notifyTicket(actor, created.id, created.siteId, created.ticketNumber, created.subject, created.priority, "created");
      return { ticket: toPublicTicket(await loadTicket(actor, created.id), ticketAccess(actor)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new HttpError(500, "Unable to create a support ticket number");
}

export async function updateTicket(actor: ActorContext, id: string, input: UpdateTicketInput) {
  requireManage(actor);
  const existing = await loadTicket(actor, id);
  const links = await resolveLinkedAssets(actor, {
    siteId: existing.siteId,
    weighbridgeId: input.weighbridgeId === undefined ? existing.weighbridgeId : input.weighbridgeId,
    gatewayId: input.gatewayId === undefined ? existing.gatewayId : input.gatewayId,
    deviceId: input.deviceId === undefined ? existing.deviceId : input.deviceId,
    transactionId: input.transactionId === undefined ? existing.transactionId : input.transactionId,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.update({
      where: { id: existing.id },
      data: {
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.description ? { description: input.description } : {}),
        weighbridgeId: links.weighbridgeId,
        gatewayId: links.gatewayId,
        deviceId: links.deviceId,
        transactionId: links.transactionId,
      },
      include: ticketInclude,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SUPPORT_TICKET_UPDATED,
        entityType: "SupportTicket",
        entityId: ticket.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { ticketNumber: ticket.ticketNumber },
      },
      tx,
    );
    return ticket;
  });

  return { ticket: toPublicTicket(updated, ticketAccess(actor)) };
}

export async function assignTicket(actor: ActorContext, id: string, input: AssignTicketInput) {
  requireManage(actor);
  const existing = await loadTicket(actor, id);
  let assignedUserId = input.assignedUserId === undefined ? existing.assignedUserId : input.assignedUserId;
  if (assignedUserId) {
    const user = await prisma.user.findFirst({
      where: { id: assignedUserId, organizationId: actor.user.organizationId, deletedAt: null, isActive: true },
      select: { id: true, fullName: true },
    });
    if (!user) {
      throw new HttpError(404, "Assigned user not found");
    }
  }

  const assignedTeam = input.assignedTeam === undefined ? existing.assignedTeam : input.assignedTeam;
  const updated = await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.update({
      where: { id: existing.id },
      data: { assignedUserId, assignedTeam },
      include: ticketInclude,
    });
    await addActivity(tx, actor, ticket.id, {
      type: "ASSIGNMENT",
      visibility: "INTERNAL",
      description: assignmentDescription(ticket.assignedUser?.fullName ?? null, assignedTeam),
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SUPPORT_TICKET_ASSIGNED,
        entityType: "SupportTicket",
        entityId: ticket.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { assignedUserId, assignedTeam },
      },
      tx,
    );
    return ticket;
  });

  if (assignedUserId && assignedUserId !== existing.assignedUserId) {
    await notifyTicket(actor, updated.id, updated.siteId, updated.ticketNumber, updated.subject, updated.priority, "assigned", assignedUserId);
  }
  return { ticket: toPublicTicket(await loadTicket(actor, updated.id), ticketAccess(actor)) };
}

export async function changeTicketPriority(actor: ActorContext, id: string, priority: SupportTicketPriority) {
  requireManage(actor);
  const existing = await loadTicket(actor, id);
  if (existing.priority === priority) {
    return { ticket: toPublicTicket(existing, ticketAccess(actor)) };
  }

  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({ where: { id: existing.id }, data: { priority } });
    await addActivity(tx, actor, existing.id, {
      type: "PRIORITY_CHANGE",
      visibility: "CUSTOMER",
      description: `Priority changed from ${existing.priority} to ${priority}.`,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SUPPORT_TICKET_PRIORITY_CHANGED,
        entityType: "SupportTicket",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { from: existing.priority, to: priority },
      },
      tx,
    );
  });

  if (priority === "CRITICAL") {
    await notifyTicket(actor, existing.id, existing.siteId, existing.ticketNumber, existing.subject, priority, "critical");
  }
  return { ticket: toPublicTicket(await loadTicket(actor, existing.id), ticketAccess(actor)) };
}

export async function transitionTicket(actor: ActorContext, id: string, input: StatusTransitionInput) {
  const existing = await loadTicket(actor, id);
  if (input.expectedStatus && existing.status !== input.expectedStatus) {
    throw new HttpError(409, "Ticket was updated by another user");
  }
  assertTicketTransition(existing.status, input.status);
  requireStatusPermission(actor, existing, input.status);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        ...(input.status === "RESOLVED"
          ? {
              resolvedAt: now,
              resolvedByUserId: actor.user.id,
              resolutionSummary: input.resolutionSummary ?? existing.resolutionSummary,
            }
          : {}),
        ...(input.status === "CLOSED" ? { closedAt: now, closedByUserId: actor.user.id } : {}),
        ...(input.status === "IN_PROGRESS" && existing.status === "RESOLVED"
          ? { resolvedAt: null, resolvedByUserId: null }
          : {}),
      },
    });
    await addActivity(tx, actor, existing.id, {
      type: input.status === "RESOLVED" ? "RESOLUTION" : "STATUS_CHANGE",
      visibility: "CUSTOMER",
      description:
        input.status === "RESOLVED" && input.resolutionSummary
          ? `Status changed to RESOLVED. ${input.resolutionSummary}`
          : `Status changed from ${existing.status} to ${input.status}.`,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action:
          input.status === "CLOSED" ? AUDIT_ACTIONS.SUPPORT_TICKET_CLOSED : AUDIT_ACTIONS.SUPPORT_TICKET_STATUS_CHANGED,
        entityType: "SupportTicket",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { from: existing.status, to: input.status },
      },
      tx,
    );
  });

  return { ticket: toPublicTicket(await loadTicket(actor, existing.id), ticketAccess(actor)) };
}

export async function closeTicket(actor: ActorContext, id: string, input: { resolutionSummary?: string | undefined }) {
  const existing = await loadTicket(actor, id);
  if (existing.status === "CLOSED") {
    throw new HttpError(409, "Ticket is already closed");
  }
  if (existing.status === "CANCELLED") {
    throw new HttpError(409, "Cancelled tickets cannot be closed");
  }
  if (existing.status !== "RESOLVED") {
    throw new HttpError(409, "Tickets can only be closed after they are resolved");
  }
  return transitionTicket(actor, id, { status: "CLOSED", expectedStatus: "RESOLVED", resolutionSummary: input.resolutionSummary });
}

export async function addTicketComment(actor: ActorContext, id: string, input: TicketCommentInput) {
  if (!ticketAccess(actor).canComment) {
    throw new HttpError(403, "You do not have access to this resource");
  }
  if (input.internal && !ticketAccess(actor).canSeeInternal) {
    throw new HttpError(403, "You cannot write internal support notes");
  }
  const existing = await loadTicket(actor, id);
  await prisma.$transaction(async (tx) => {
    await addActivity(tx, actor, existing.id, {
      type: input.internal ? "INTERNAL_NOTE" : "COMMENT",
      visibility: input.internal ? "INTERNAL" : "CUSTOMER",
      description: input.body,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.SUPPORT_TICKET_COMMENT_ADDED,
        entityType: "SupportTicket",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { internal: input.internal },
      },
      tx,
    );
  });
  return { ticket: toPublicTicket(await loadTicket(actor, existing.id), ticketAccess(actor)) };
}

export async function listAssignees(actor: ActorContext) {
  requireManage(actor);
  const users = await prisma.user.findMany({
    where: {
      organizationId: actor.user.organizationId,
      isActive: true,
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            rolePermissions: {
              some: { permission: { code: { in: ["support.ticket.manage", "support.internal"] } } },
            },
          },
        },
      },
    },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
    take: 50,
  });
  return { items: users };
}

export async function supportCatalog() {
  return {
    categories: [
      "WEIGHBRIDGE",
      "DEVICE",
      "GATEWAY",
      "ANPR",
      "DOCUMENT_SCANNER",
      "SOFTWARE",
      "NETWORK",
      "OFFLINE_SYNC",
      "USER_ACCESS",
      "TRANSACTION",
      "REPORTING",
      "OTHER",
    ],
    priorities: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    ticketStatuses: [
      "OPEN",
      "ACKNOWLEDGED",
      "IN_PROGRESS",
      "WAITING_FOR_CUSTOMER",
      "WAITING_FOR_MAINTENANCE",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ],
    maintenanceTypes: ["CORRECTIVE", "PREVENTIVE", "INSPECTION", "CALIBRATION", "COMMISSIONING", "REPAIR", "OTHER"],
    maintenanceStatuses: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
    openTicketStatuses: OPEN_TICKET_STATUSES,
    activeMaintenanceStatuses: ACTIVE_MAINTENANCE_STATUSES,
    transitions: Object.fromEntries(
      (
        [
          "OPEN",
          "ACKNOWLEDGED",
          "IN_PROGRESS",
          "WAITING_FOR_CUSTOMER",
          "WAITING_FOR_MAINTENANCE",
          "RESOLVED",
          "CLOSED",
          "CANCELLED",
        ] as SupportTicketStatus[]
      ).map((status) => [status, allowedTicketTransitions(status)]),
    ),
  };
}

export async function loadTicket(actor: ActorContext, id: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id, organizationId: actor.user.organizationId, ...supportSiteWhere(actor) },
    include: ticketInclude,
  });
  if (!ticket) {
    const hidden = await prisma.supportTicket.findFirst({
      where: { id },
      select: { organizationId: true, siteId: true },
    });
    if (hidden && hidden.organizationId === actor.user.organizationId) {
      throw new HttpError(403, "You do not have access to this resource");
    }
    throw new HttpError(404, "Support ticket not found");
  }
  return ticket;
}

export async function nextSupportNumber(tx: DbClient, organizationId: string, prefix: "SUP" | "MNT"): Promise<string> {
  const year = new Date().getUTCFullYear();
  const startsWith = supportNumberPrefix(prefix, year);
  const latestValue =
    prefix === "SUP"
      ? (
          await tx.supportTicket.findFirst({
            where: { organizationId, ticketNumber: { startsWith } },
            orderBy: { ticketNumber: "desc" },
            select: { ticketNumber: true },
          })
        )?.ticketNumber
      : (
          await tx.serviceMaintenanceRecord.findFirst({
            where: { organizationId, recordNumber: { startsWith } },
            orderBy: { recordNumber: "desc" },
            select: { recordNumber: true },
          })
        )?.recordNumber;
  const current = latestValue ? parseSupportSequence(latestValue, prefix, year) : 0;
  return formatSupportNumber(prefix, year, (current ?? 0) + 1);
}

export async function addActivity(
  tx: DbClient,
  actor: ActorContext,
  ticketId: string,
  input: { type: Prisma.SupportTicketActivityCreateInput["type"]; visibility: "CUSTOMER" | "INTERNAL"; description: string },
): Promise<void> {
  await tx.supportTicketActivity.create({
    data: {
      organizationId: actor.user.organizationId,
      ticketId,
      actorUserId: actor.user.id,
      type: input.type,
      visibility: input.visibility,
      description: input.description,
    },
  });
}

function buildTicketWhere(actor: ActorContext, query: TicketListQuery): Prisma.SupportTicketWhereInput {
  const where: Prisma.SupportTicketWhereInput = {
    organizationId: actor.user.organizationId,
    ...supportSiteWhere(actor),
  };
  if (query.siteId) where.siteId = query.siteId;
  if (query.weighbridgeId) where.weighbridgeId = query.weighbridgeId;
  if (query.deviceId) where.deviceId = query.deviceId;
  if (query.gatewayId) where.gatewayId = query.gatewayId;
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.category) where.category = query.category;
  if (query.from || query.to) {
    where.createdAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { ticketNumber: { contains: query.q.toUpperCase(), mode: "insensitive" } },
      { subject: { contains: query.q, mode: "insensitive" } },
      { device: { is: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } } },
      { weighbridge: { is: { OR: [{ code: { contains: query.q, mode: "insensitive" } }, { name: { contains: query.q, mode: "insensitive" } }] } } },
    ];
  }
  return where;
}

function requireManage(actor: ActorContext): void {
  if (!ticketAccess(actor).canManage) {
    throw new HttpError(403, "You do not have access to this resource");
  }
}

function requireStatusPermission(
  actor: ActorContext,
  ticket: { status: SupportTicketStatus; createdByUserId: string },
  next: SupportTicketStatus,
): void {
  if (ticketAccess(actor).canManage) {
    return;
  }
  const customerClose = ticket.status === "RESOLVED" && next === "CLOSED";
  const customerCancel = ticket.status === "OPEN" && next === "CANCELLED" && ticket.createdByUserId === actor.user.id;
  if ((customerClose || customerCancel) && ticketAccess(actor).canComment) {
    return;
  }
  throw new HttpError(403, "You do not have access to this resource");
}

function assignmentDescription(name: string | null, team: string | null): string {
  if (name && team) {
    return `Assigned to ${name} (${team}).`;
  }
  if (name) {
    return `Assigned to ${name}.`;
  }
  if (team) {
    return `Assigned to team ${team}.`;
  }
  return "Assignment cleared.";
}

async function notifyTicket(
  actor: ActorContext,
  ticketId: string,
  siteId: string,
  ticketNumber: string,
  subject: string,
  priority: SupportTicketPriority,
  kind: "created" | "assigned" | "critical",
  assignedUserId?: string,
): Promise<void> {
  const type =
    kind === "assigned" ? "SUPPORT_TICKET_ASSIGNED" : priority === "CRITICAL" || kind === "critical" ? "SUPPORT_TICKET_CRITICAL" : "SUPPORT_TICKET_CREATED";
  await safeEmitOperationalEvent({
    actor,
    type,
    organizationId: actor.user.organizationId,
    siteId,
    title: kind === "assigned" ? `Ticket ${ticketNumber} assigned` : `Support ticket ${ticketNumber}`,
    message: subject,
    eventKey: `support.ticket.${kind}:${ticketId}`,
    entityType: "SupportTicket",
    entityId: ticketId,
    ...(assignedUserId ? { assignedUserId, extraRecipientUserIds: [assignedUserId] } : {}),
  });
}
