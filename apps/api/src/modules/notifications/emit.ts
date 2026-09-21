import { Prisma } from "@prisma/client";
import {
  EVENT_KEYS,
  getNotificationDefinition,
  type NotificationType,
} from "../../domain/notificationCatalog.js";
import { prisma } from "../../db/client.js";
import { writeLog } from "../../lib/logger.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { isCategoryEnabled, resolveEventRecipients } from "./recipients.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type OperationalEventInput = {
  actor: ActorContext;
  type: NotificationType;
  organizationId: string;
  siteId: string;
  title: string;
  message: string;
  eventKey: string;
  transactionId?: string | null;
  approvalId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  departmentId?: string | null;
  departmentCode?: string | null;
  assignedUserId?: string | null;
  extraRecipientUserIds?: string[];
};

export type EmitResult = {
  notificationIds: string[];
  alertId: string | null;
  skippedDuplicates: number;
};

export async function emitOperationalEvent(
  input: OperationalEventInput,
  db: DbClient = prisma,
): Promise<EmitResult> {
  const definition = getNotificationDefinition(input.type);
  const recipients = await resolveEventRecipients(db, {
    type: input.type,
    organizationId: input.organizationId,
    siteId: input.siteId,
    actorUserId: input.actor.user.id,
    ...(input.departmentId === undefined ? {} : { departmentId: input.departmentId }),
    ...(input.departmentCode === undefined ? {} : { departmentCode: input.departmentCode }),
    ...(input.assignedUserId === undefined ? {} : { assignedUserId: input.assignedUserId }),
    ...(input.extraRecipientUserIds === undefined ? {} : { extraRecipientUserIds: input.extraRecipientUserIds }),
  });

  const notificationIds: string[] = [];
  let skippedDuplicates = 0;

  for (const recipient of recipients) {
    const enabled = await isCategoryEnabled(db, recipient.id, definition.category);
    if (!enabled) {
      continue;
    }

    try {
      const notification = await db.notification.create({
        data: {
          organizationId: input.organizationId,
          siteId: input.siteId,
          recipientUserId: recipient.id,
          type: input.type,
          category: definition.category,
          severity: definition.severity,
          title: input.title,
          message: input.message,
          entityType: input.entityType ?? (input.approvalId ? "Approval" : input.transactionId ? "Transaction" : null),
          entityId: input.entityId ?? input.approvalId ?? input.transactionId ?? null,
          transactionId: input.transactionId ?? null,
          approvalId: input.approvalId ?? null,
          eventKey: input.eventKey,
        },
      });

      await writeAudit(
        {
          organizationId: input.organizationId,
          actorUserId: systemActorId(input.actor.user.id),
          action: AUDIT_ACTIONS.NOTIFICATION_CREATED,
          entityType: "Notification",
          entityId: notification.id,
          ipAddress: input.actor.ipAddress,
          userAgent: input.actor.userAgent,
          metadata: {
            recipientUserId: recipient.id,
            type: input.type,
            eventKey: input.eventKey,
            transactionId: input.transactionId ?? null,
            approvalId: input.approvalId ?? null,
          },
        },
        db,
      );
      notificationIds.push(notification.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skippedDuplicates += 1;
        continue;
      }
      throw error;
    }
  }

  let alertId: string | null = null;
  if (definition.createAlert) {
    alertId = await upsertOperationalAlert(db, input);
  }

  await resolveRelatedAlerts(db, input);

  return { notificationIds, alertId, skippedDuplicates };
}

export async function safeEmitOperationalEvent(input: OperationalEventInput): Promise<EmitResult> {
  try {
    return await emitOperationalEvent(input);
  } catch (error) {
    writeLog("error", "notification_emit_failed", {
      type: input.type,
      eventKey: input.eventKey,
      transactionId: input.transactionId ?? null,
      errorCategory: "SYSTEM_ERROR",
      message: error instanceof Error ? error.message : "unknown",
    });
    return { notificationIds: [], alertId: null, skippedDuplicates: 0 };
  }
}

export function transactionLabel(input: {
  referenceNumber: string;
  vehicleNumber?: string | null;
  materialName?: string | null;
}): string {
  const extras = [input.vehicleNumber, input.materialName].filter((value): value is string => Boolean(value));
  return extras.length > 0 ? `${input.referenceNumber} (${extras.join(" — ")})` : input.referenceNumber;
}

async function upsertOperationalAlert(db: DbClient, input: OperationalEventInput): Promise<string | null> {
  const definition = getNotificationDefinition(input.type);
  const existing = await db.operationalAlert.findUnique({
    where: {
      organizationId_eventKey: {
        organizationId: input.organizationId,
        eventKey: input.eventKey,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  try {
    const created = await db.operationalAlert.create({
      data: {
        organizationId: input.organizationId,
        siteId: input.siteId,
        type: input.type,
        severity: definition.severity,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? (input.approvalId ? "Approval" : input.transactionId ? "Transaction" : null),
        entityId: input.entityId ?? input.approvalId ?? input.transactionId ?? null,
        transactionId: input.transactionId ?? null,
        eventKey: input.eventKey,
      },
    });

    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: persistActorId(input.actor.user.id),
        action: AUDIT_ACTIONS.ALERT_CREATED,
        entityType: "OperationalAlert",
        entityId: created.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
        metadata: {
          type: input.type,
          eventKey: input.eventKey,
          transactionId: input.transactionId ?? null,
        },
      },
      db,
    );
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await db.operationalAlert.findUnique({
        where: {
          organizationId_eventKey: {
            organizationId: input.organizationId,
            eventKey: input.eventKey,
          },
        },
        select: { id: true },
      });
      return duplicate?.id ?? null;
    }
    throw error;
  }
}

async function resolveRelatedAlerts(db: DbClient, input: OperationalEventInput): Promise<void> {
  const open = await matchingOpenAlerts(db, input);
  if (open.length === 0) {
    return;
  }

  for (const alert of open) {
    await db.operationalAlert.update({
      where: { id: alert.id },
      data: {
        status: "RESOLVED",
        resolvedByUserId: persistActorId(input.actor.user.id) ?? null,
        resolvedAt: new Date(),
      },
    });
    await writeAudit(
      {
        organizationId: input.organizationId,
        actorUserId: persistActorId(input.actor.user.id),
        action: AUDIT_ACTIONS.ALERT_RESOLVED,
        entityType: "OperationalAlert",
        entityId: alert.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
        metadata: { eventKey: alert.eventKey, reason: input.type },
      },
      db,
    );
  }
}

function relatedAlertKeys(input: OperationalEventInput): string[] {
  if (input.type === "APPROVAL_APPROVED" || input.type === "APPROVAL_REJECTED") {
    return input.approvalId ? [EVENT_KEYS.approvalRequired(input.approvalId)] : [];
  }
  if (input.type === "DOCUMENT_VERIFIED") {
    return input.entityId ? [EVENT_KEYS.documentReview(input.entityId)] : [];
  }
  if (input.type === "TRANSACTION_COMPLETED" && input.transactionId) {
    return [
      EVENT_KEYS.secondWeighment(input.transactionId),
      EVENT_KEYS.unloadingAssigned(input.transactionId, "*", "*"),
      EVENT_KEYS.staleTransaction(input.transactionId),
    ];
  }
  if (input.eventKey.startsWith("hardware.recovered:")) {
    const rest = input.eventKey.slice("hardware.recovered:".length);
    return [
      `hardware.disconnected:${rest}`,
      `hardware.connection_failed:${rest}`,
      `hardware.no_data:${rest}`,
    ];
  }
  if (input.type === "GATEWAY_RECOVERED" && input.entityId) {
    const day = new Date().toISOString().slice(0, 10);
    return [
      EVENT_KEYS.gatewayStale(input.entityId, day),
      EVENT_KEYS.gatewayOffline(input.entityId, day),
    ];
  }
  if (input.type === "BACKUP_RECOVERED") {
    return [EVENT_KEYS.backupFailed(new Date().toISOString().slice(0, 10))];
  }
  if (input.type === "SYNC_RECOVERED" && input.entityId) {
    return [EVENT_KEYS.syncFailure(input.entityId, new Date().toISOString().slice(0, 10))];
  }
  return [];
}

async function matchingOpenAlerts(db: DbClient, input: OperationalEventInput) {
  const keys = relatedAlertKeys(input);
  const hardwareRecovery = input.eventKey.startsWith("hardware.recovered:") && input.entityId;
  const gatewayRecovery = input.type === "GATEWAY_RECOVERED" && input.entityId;
  const backupRecovery = input.type === "BACKUP_RECOVERED";
  const syncRecovery = input.type === "SYNC_RECOVERED" && input.entityId;
  if (keys.length === 0 && !hardwareRecovery && !gatewayRecovery && !backupRecovery && !syncRecovery) {
    return [];
  }

  return db.operationalAlert.findMany({
    where: {
      organizationId: input.organizationId,
      status: { not: "RESOLVED" },
      OR: [
        ...(keys.length > 0 ? [{ eventKey: { in: keys } }] : []),
        ...(input.entityId && hardwareRecovery
          ? [{ entityId: input.entityId, entityType: "Weighbridge", type: "SYSTEM_ALERT" }]
          : []),
        ...(gatewayRecovery
          ? [
              { eventKey: { startsWith: `gateway.offline:${input.entityId}:` } },
              { eventKey: { startsWith: `gateway.stale:${input.entityId}:` } },
            ]
          : []),
        ...(backupRecovery ? [{ eventKey: { startsWith: "backup.failed:" } }] : []),
        ...(syncRecovery ? [{ eventKey: { startsWith: `sync.failure:${input.entityId}:` } }] : []),
      ],
    },
  });
}

function persistActorId(userId: string): string | undefined {
  return userId.startsWith("system:") ? undefined : userId;
}

function systemActorId(userId: string): string | undefined {
  return persistActorId(userId);
}
