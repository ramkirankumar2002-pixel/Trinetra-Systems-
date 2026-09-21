import { Prisma } from "@prisma/client";
import {
  isNotificationCategory,
  NOTIFICATION_CATEGORIES,
  SEVERITY_RANK,
  type NotificationCategory,
  type NotificationSeverity,
} from "../../domain/notificationCatalog.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicNotification, type PublicNotification } from "./mapper.js";
import { parseNotificationFilters, parseNotificationPagination } from "./validators.js";

export type UnreadBreakdown = {
  unreadCount: number;
  bySeverity: Array<{ severity: NotificationSeverity; count: number }>;
  byType: Array<{ type: string; count: number }>;
};

export type NotificationListResult = {
  items: PublicNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
} & UnreadBreakdown;

export async function listNotifications(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<NotificationListResult> {
  const pagination = parseNotificationPagination(query);
  const filters = parseNotificationFilters(query);
  const where = ownedWhere(actor, filters);

  const [total, rows, unread] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
    unreadBreakdown(actor),
  ]);

  return {
    items: rows.map(toPublicNotification),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
    ...unread,
  };
}

export async function getNotification(actor: ActorContext, id: string): Promise<PublicNotification> {
  return toPublicNotification(await loadOwnedNotification(actor, id));
}

export async function getUnreadCount(actor: ActorContext): Promise<UnreadBreakdown> {
  return unreadBreakdown(actor);
}

export async function markNotificationRead(actor: ActorContext, id: string): Promise<PublicNotification> {
  const existing = await loadOwnedNotification(actor, id);
  if (existing.readAt) {
    return toPublicNotification(existing);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.NOTIFICATION_READ,
        entityType: "Notification",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          approvalId: next.approvalId,
          transactionId: next.transactionId,
        },
      },
      tx,
    );
    return next;
  });

  return toPublicNotification(updated);
}

export async function markNotificationUnread(actor: ActorContext, id: string): Promise<PublicNotification> {
  const existing = await loadOwnedNotification(actor, id);
  if (!existing.readAt) {
    return toPublicNotification(existing);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.notification.update({
      where: { id: existing.id },
      data: { readAt: null },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.NOTIFICATION_UNREAD,
        entityType: "Notification",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
      tx,
    );
    return next;
  });

  return toPublicNotification(updated);
}

export async function markAllNotificationsRead(actor: ActorContext): Promise<{ updated: number } & UnreadBreakdown> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.notification.updateMany({
      where: {
        organizationId: actor.user.organizationId,
        recipientUserId: actor.user.id,
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.NOTIFICATION_READ_ALL,
        entityType: "User",
        entityId: actor.user.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { updated: updated.count },
      },
      tx,
    );
    return updated.count;
  });

  return { updated: result, ...(await unreadBreakdown(actor)) };
}

export async function listNotificationPreferences(actor: ActorContext): Promise<{
  items: Array<{ category: NotificationCategory; inAppEnabled: boolean }>;
}> {
  const rows = await prisma.notificationPreference.findMany({
    where: { userId: actor.user.id },
  });
  const byCategory = new Map(rows.map((row) => [row.category, row.inAppEnabled]));
  return {
    items: NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      inAppEnabled: byCategory.get(category) ?? true,
    })),
  };
}

export async function upsertNotificationPreference(
  actor: ActorContext,
  input: Record<string, unknown>,
): Promise<{ category: NotificationCategory; inAppEnabled: boolean }> {
  const category = input.category;
  if (typeof category !== "string" || !isNotificationCategory(category)) {
    throw new HttpError(400, "category is invalid");
  }
  if (typeof input.inAppEnabled !== "boolean") {
    throw new HttpError(400, "inAppEnabled must be a boolean");
  }

  const row = await prisma.notificationPreference.upsert({
    where: { userId_category: { userId: actor.user.id, category } },
    update: { inAppEnabled: input.inAppEnabled },
    create: {
      userId: actor.user.id,
      category,
      inAppEnabled: input.inAppEnabled,
    },
  });

  return { category: row.category, inAppEnabled: row.inAppEnabled };
}

async function loadOwnedNotification(actor: ActorContext, id: string) {
  const existing = await prisma.notification.findFirst({
    where: {
      id,
      organizationId: actor.user.organizationId,
      recipientUserId: actor.user.id,
    },
  });
  if (!existing) {
    throw new HttpError(404, "Notification not found");
  }
  return existing;
}

function ownedWhere(
  actor: ActorContext,
  filters: ReturnType<typeof parseNotificationFilters>,
): Prisma.NotificationWhereInput {
  return {
    organizationId: actor.user.organizationId,
    recipientUserId: actor.user.id,
    ...(filters.read === "unread" ? { readAt: null } : {}),
    ...(filters.read === "read" ? { readAt: { not: null } } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
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

async function unreadBreakdown(actor: ActorContext): Promise<UnreadBreakdown> {
  const unread = await prisma.notification.findMany({
    where: {
      organizationId: actor.user.organizationId,
      recipientUserId: actor.user.id,
      readAt: null,
    },
    select: { severity: true, type: true },
  });

  const bySeverityMap = new Map<NotificationSeverity, number>();
  const byTypeMap = new Map<string, number>();
  for (const row of unread) {
    bySeverityMap.set(row.severity, (bySeverityMap.get(row.severity) ?? 0) + 1);
    byTypeMap.set(row.type, (byTypeMap.get(row.type) ?? 0) + 1);
  }

  return {
    unreadCount: unread.length,
    bySeverity: [...bySeverityMap.entries()]
      .map(([severity, count]) => ({ severity, count }))
      .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]),
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
  };
}
