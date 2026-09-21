import type { PrismaClient } from "@prisma/client";

export async function seedDemoSupport(input: {
  organizationId: string;
  siteId: string;
  siteBId: string;
  weighbridgeId: string;
  gatewayId: string;
  createdByUserId: string;
  supportUserId: string;
  operatorUserId: string;
  db: PrismaClient;
}): Promise<void> {
  const db = input.db;
  const device = await db.edgeDevice.findFirst({
    where: { gatewayId: input.gatewayId, code: "WB-01" },
    select: { id: true },
  });

  const openTicket = await upsertTicket(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    ticketNumber: "SUP-2026-900001",
    category: "WEIGHBRIDGE",
    priority: "HIGH",
    status: "IN_PROGRESS",
    subject: "Demo: indicator reading delayed after reconnect",
    description:
      "Development demo ticket only. Simulated weighbridge indicator took longer than expected to resume after a reconnect.",
    createdByUserId: input.operatorUserId,
    assignedUserId: input.supportUserId,
    assignedTeam: "Trinetra Support",
    weighbridgeId: input.weighbridgeId,
    gatewayId: input.gatewayId,
    deviceId: device?.id ?? null,
  });

  const resolvedTicket = await upsertTicket(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    ticketNumber: "SUP-2026-900002",
    category: "SOFTWARE",
    priority: "MEDIUM",
    status: "RESOLVED",
    subject: "Demo: report filter reset after site switch",
    description: "Development demo ticket only. Operator asked why report filters cleared after changing site context.",
    createdByUserId: input.createdByUserId,
    assignedUserId: input.supportUserId,
    assignedTeam: "Trinetra Support",
    resolutionSummary: "Expected behaviour: filters are site-scoped. Operator confirmed after explanation.",
    resolvedAt: new Date(),
    resolvedByUserId: input.supportUserId,
  });

  await upsertTicket(db, {
    organizationId: input.organizationId,
    siteId: input.siteBId,
    ticketNumber: "SUP-2026-900003",
    category: "NETWORK",
    priority: "LOW",
    status: "OPEN",
    subject: "Demo: Site B user cannot see Site A tickets",
    description: "Development demo ticket only. Confirms site isolation for support records.",
    createdByUserId: input.createdByUserId,
  });

  await upsertActivity(db, {
    organizationId: input.organizationId,
    ticketId: openTicket.id,
    actorUserId: input.operatorUserId,
    type: "COMMENT",
    visibility: "CUSTOMER",
    description: "Demo customer note: readings resume after about 20 seconds.",
  });
  await upsertActivity(db, {
    organizationId: input.organizationId,
    ticketId: openTicket.id,
    actorUserId: input.supportUserId,
    type: "INTERNAL_NOTE",
    visibility: "INTERNAL",
    description: "Demo internal note: check simulator reconnect delay before changing hardware configuration.",
  });
  await upsertActivity(db, {
    organizationId: input.organizationId,
    ticketId: resolvedTicket.id,
    actorUserId: input.supportUserId,
    type: "RESOLUTION",
    visibility: "CUSTOMER",
    description: "Demo resolution: site-scoped report filters are working as designed.",
  });

  await upsertMaintenance(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    recordNumber: "MNT-2026-900001",
    type: "INSPECTION",
    status: "COMPLETED",
    reason: "Demo preventive inspection of WB-01",
    description: "Development demo maintenance record only. Visual inspection of simulator indicator and gateway.",
    findings: "Simulator provider healthy. No production hardware involved.",
    actionTaken: "Recorded inspection against the demo weighbridge.",
    performedByUserId: input.supportUserId,
    ticketId: openTicket.id,
    weighbridgeId: input.weighbridgeId,
    gatewayId: input.gatewayId,
    deviceId: device?.id ?? null,
    startedAt: new Date(Date.now() - 3_600_000),
    endedAt: new Date(Date.now() - 1_800_000),
    completedAt: new Date(Date.now() - 1_800_000),
  });

  await upsertMaintenance(db, {
    organizationId: input.organizationId,
    siteId: input.siteId,
    recordNumber: "MNT-2026-900002",
    type: "CORRECTIVE",
    status: "SCHEDULED",
    reason: "Demo follow-up after delayed reconnect",
    description: "Development demo work order only. Scheduled re-check of reconnect behaviour.",
    performedByUserId: input.supportUserId,
    ticketId: openTicket.id,
    weighbridgeId: input.weighbridgeId,
    deviceId: device?.id ?? null,
  });
}

async function upsertTicket(
  db: PrismaClient,
  data: {
    organizationId: string;
    siteId: string;
    ticketNumber: string;
    category: "WEIGHBRIDGE" | "SOFTWARE" | "NETWORK";
    priority: "LOW" | "MEDIUM" | "HIGH";
    status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
    subject: string;
    description: string;
    createdByUserId: string;
    assignedUserId?: string;
    assignedTeam?: string;
    weighbridgeId?: string | null;
    gatewayId?: string | null;
    deviceId?: string | null;
    resolutionSummary?: string;
    resolvedAt?: Date;
    resolvedByUserId?: string;
  },
) {
  const existing = await db.supportTicket.findUnique({
    where: {
      organizationId_ticketNumber: {
        organizationId: data.organizationId,
        ticketNumber: data.ticketNumber,
      },
    },
  });
  if (existing) {
    return existing;
  }
  return db.supportTicket.create({
    data: {
      organizationId: data.organizationId,
      siteId: data.siteId,
      ticketNumber: data.ticketNumber,
      category: data.category,
      priority: data.priority,
      status: data.status,
      subject: data.subject,
      description: data.description,
      createdByUserId: data.createdByUserId,
      assignedUserId: data.assignedUserId ?? null,
      assignedTeam: data.assignedTeam ?? null,
      weighbridgeId: data.weighbridgeId ?? null,
      gatewayId: data.gatewayId ?? null,
      deviceId: data.deviceId ?? null,
      resolutionSummary: data.resolutionSummary ?? null,
      resolvedAt: data.resolvedAt ?? null,
      resolvedByUserId: data.resolvedByUserId ?? null,
    },
  });
}

async function upsertActivity(
  db: PrismaClient,
  data: {
    organizationId: string;
    ticketId: string;
    actorUserId: string;
    type: "COMMENT" | "INTERNAL_NOTE" | "RESOLUTION";
    visibility: "CUSTOMER" | "INTERNAL";
    description: string;
  },
): Promise<void> {
  const existing = await db.supportTicketActivity.findFirst({
    where: { ticketId: data.ticketId, description: data.description },
  });
  if (existing) {
    return;
  }
  await db.supportTicketActivity.create({ data });
}

async function upsertMaintenance(
  db: PrismaClient,
  data: {
    organizationId: string;
    siteId: string;
    recordNumber: string;
    type: "INSPECTION" | "CORRECTIVE";
    status: "SCHEDULED" | "COMPLETED";
    reason: string;
    description: string;
    findings?: string;
    actionTaken?: string;
    performedByUserId: string;
    ticketId?: string | null;
    weighbridgeId?: string | null;
    gatewayId?: string | null;
    deviceId?: string | null;
    startedAt?: Date;
    endedAt?: Date;
    completedAt?: Date;
  },
): Promise<void> {
  const existing = await db.serviceMaintenanceRecord.findUnique({
    where: {
      organizationId_recordNumber: {
        organizationId: data.organizationId,
        recordNumber: data.recordNumber,
      },
    },
  });
  if (existing) {
    return;
  }
  await db.serviceMaintenanceRecord.create({
    data: {
      organizationId: data.organizationId,
      siteId: data.siteId,
      recordNumber: data.recordNumber,
      type: data.type,
      status: data.status,
      reason: data.reason,
      description: data.description,
      findings: data.findings ?? null,
      actionTaken: data.actionTaken ?? null,
      performedByUserId: data.performedByUserId,
      ticketId: data.ticketId ?? null,
      weighbridgeId: data.weighbridgeId ?? null,
      gatewayId: data.gatewayId ?? null,
      deviceId: data.deviceId ?? null,
      startedAt: data.startedAt ?? null,
      endedAt: data.endedAt ?? null,
      completedAt: data.completedAt ?? null,
    },
  });
}
