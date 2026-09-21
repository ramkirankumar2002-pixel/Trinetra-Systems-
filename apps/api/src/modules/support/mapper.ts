import type {
  EdgeDevice,
  EdgeGateway,
  Prisma,
  SupportTicket,
  SupportTicketActivity,
  Weighbridge,
} from "@prisma/client";
import { allowedTicketTransitions, type SupportTicketStatus } from "../../domain/support/index.js";

export const namedRef = { select: { id: true, code: true, name: true } } as const;
export const userRef = { select: { id: true, fullName: true, email: true } } as const;

export const ticketInclude = {
  site: namedRef,
  createdByUser: userRef,
  assignedUser: userRef,
  resolvedByUser: userRef,
  closedByUser: userRef,
  weighbridge: namedRef,
  gateway: namedRef,
  device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
  transaction: { select: { id: true, referenceNumber: true, status: true } },
  activities: {
    orderBy: { createdAt: "asc" as const },
    include: { actorUser: userRef },
  },
  maintenanceRecords: {
    orderBy: { createdAt: "desc" as const },
    take: 20,
    select: {
      id: true,
      recordNumber: true,
      type: true,
      status: true,
      reason: true,
      createdAt: true,
      completedAt: true,
    },
  },
} as const;

export const maintenanceInclude = {
  site: namedRef,
  performedByUser: userRef,
  weighbridge: namedRef,
  gateway: namedRef,
  device: { select: { id: true, code: true, name: true, status: true, installationStatus: true } },
  ticket: { select: { id: true, ticketNumber: true, subject: true, status: true } },
  maintenanceEvent: {
    select: { id: true, status: true, startedAt: true, endedAt: true, reason: true, startedByUserId: true },
  },
} as const;

export type TicketRecord = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;
export type MaintenanceRecord = Prisma.ServiceMaintenanceRecordGetPayload<{ include: typeof maintenanceInclude }>;

export type PublicUserRef = { id: string; fullName: string; email?: string };
export type PublicNamedRef = { id: string; code: string; name: string };

export type PublicTicketActivity = {
  id: string;
  type: string;
  visibility: string;
  description: string;
  createdAt: string;
  actor: PublicUserRef;
};

export type PublicSupportTicket = {
  id: string;
  ticketNumber: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  assignedTeam: string | null;
  resolutionSummary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  allowedTransitions: SupportTicketStatus[];
  canManage: boolean;
  canComment: boolean;
  canSeeInternal: boolean;
  site: PublicNamedRef;
  createdBy: PublicUserRef;
  assignedUser: PublicUserRef | null;
  resolvedBy: PublicUserRef | null;
  closedBy: PublicUserRef | null;
  weighbridge: PublicNamedRef | null;
  gateway: PublicNamedRef | null;
  device: { id: string; code: string; name: string; status: string; installationStatus: string } | null;
  transaction: { id: string; referenceNumber: string; status: string } | null;
  activities: PublicTicketActivity[];
  maintenanceRecords: Array<{
    id: string;
    recordNumber: string;
    type: string;
    status: string;
    reason: string;
    createdAt: string;
    completedAt: string | null;
  }>;
};

export type PublicMaintenance = {
  id: string;
  recordNumber: string;
  type: string;
  status: string;
  reason: string;
  description: string;
  findings: string | null;
  actionTaken: string | null;
  partsReplaced: string | null;
  beforeCondition: string | null;
  afterCondition: string | null;
  startedAt: string | null;
  endedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  site: PublicNamedRef;
  performedBy: PublicUserRef | null;
  weighbridge: PublicNamedRef | null;
  gateway: PublicNamedRef | null;
  device: { id: string; code: string; name: string; status: string; installationStatus: string } | null;
  ticket: { id: string; ticketNumber: string; subject: string; status: string } | null;
  maintenanceWindow: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    reason: string;
  } | null;
};

export function toPublicTicket(
  record: TicketRecord,
  access: { canManage: boolean; canComment: boolean; canSeeInternal: boolean },
): PublicSupportTicket {
  const activities = record.activities
    .filter((activity) => access.canSeeInternal || activity.visibility === "CUSTOMER")
    .map(toPublicActivity);

  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    category: record.category,
    priority: record.priority,
    status: record.status,
    subject: record.subject,
    description: record.description,
    assignedTeam: record.assignedTeam,
    resolutionSummary: record.resolutionSummary,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    closedAt: record.closedAt?.toISOString() ?? null,
    allowedTransitions: allowedTicketTransitions(record.status),
    canManage: access.canManage,
    canComment: access.canComment,
    canSeeInternal: access.canSeeInternal,
    site: record.site,
    createdBy: toUserRef(record.createdByUser),
    assignedUser: record.assignedUser ? toUserRef(record.assignedUser) : null,
    resolvedBy: record.resolvedByUser ? toUserRef(record.resolvedByUser) : null,
    closedBy: record.closedByUser ? toUserRef(record.closedByUser) : null,
    weighbridge: record.weighbridge,
    gateway: record.gateway,
    device: record.device,
    transaction: record.transaction,
    activities,
    maintenanceRecords: record.maintenanceRecords.map((item) => ({
      id: item.id,
      recordNumber: item.recordNumber,
      type: item.type,
      status: item.status,
      reason: item.reason,
      createdAt: item.createdAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
    })),
  };
}

export function toPublicTicketSummary(
  record: SupportTicket & {
    site: PublicNamedRef;
    assignedUser: { id: string; fullName: string; email: string } | null;
    weighbridge: PublicNamedRef | null;
    device: { id: string; code: string; name: string } | null;
  },
): {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: PublicNamedRef;
  assignedUser: PublicUserRef | null;
  weighbridge: PublicNamedRef | null;
  device: { id: string; code: string; name: string } | null;
} {
  return {
    id: record.id,
    ticketNumber: record.ticketNumber,
    subject: record.subject,
    category: record.category,
    priority: record.priority,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    site: record.site,
    assignedUser: record.assignedUser ? toUserRef(record.assignedUser) : null,
    weighbridge: record.weighbridge,
    device: record.device,
  };
}

export function toPublicMaintenance(record: MaintenanceRecord): PublicMaintenance {
  return {
    id: record.id,
    recordNumber: record.recordNumber,
    type: record.type,
    status: record.status,
    reason: record.reason,
    description: record.description,
    findings: record.findings,
    actionTaken: record.actionTaken,
    partsReplaced: record.partsReplaced,
    beforeCondition: record.beforeCondition,
    afterCondition: record.afterCondition,
    startedAt: record.startedAt?.toISOString() ?? null,
    endedAt: record.endedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    site: record.site,
    performedBy: record.performedByUser ? toUserRef(record.performedByUser) : null,
    weighbridge: record.weighbridge,
    gateway: record.gateway,
    device: record.device,
    ticket: record.ticket,
    maintenanceWindow: record.maintenanceEvent
      ? {
          id: record.maintenanceEvent.id,
          status: record.maintenanceEvent.status,
          startedAt: record.maintenanceEvent.startedAt.toISOString(),
          endedAt: record.maintenanceEvent.endedAt?.toISOString() ?? null,
          reason: record.maintenanceEvent.reason,
        }
      : null,
  };
}

export function toPublicActivity(
  activity: SupportTicketActivity & { actorUser: { id: string; fullName: string; email: string } },
): PublicTicketActivity {
  return {
    id: activity.id,
    type: activity.type,
    visibility: activity.visibility,
    description: activity.description,
    createdAt: activity.createdAt.toISOString(),
    actor: toUserRef(activity.actorUser),
  };
}

function toUserRef(user: { id: string; fullName: string; email?: string }): PublicUserRef {
  return { id: user.id, fullName: user.fullName, ...(user.email ? { email: user.email } : {}) };
}

export function hardwareLabel(device: Pick<EdgeDevice, "code" | "name">): string {
  return `${device.code} · ${device.name}`;
}

export function weighbridgeLabel(weighbridge: Pick<Weighbridge, "code" | "name">): string {
  return `${weighbridge.code} · ${weighbridge.name}`;
}

export function gatewayLabel(gateway: Pick<EdgeGateway, "code" | "name">): string {
  return `${gateway.code} · ${gateway.name}`;
}
