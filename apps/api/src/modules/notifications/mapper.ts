import type {
  Notification,
  NotificationCategory,
  NotificationSeverity,
  OperationalAlert,
  OperationalAlertStatus,
} from "@prisma/client";
import { notificationHref, normalizeNotificationType } from "../../domain/notificationCatalog.js";

export type PublicNotification = {
  id: string;
  type: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  transactionId: string | null;
  approvalId: string | null;
  siteId: string | null;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export type PublicOperationalAlert = {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: OperationalAlertStatus;
  entityType: string | null;
  entityId: string | null;
  transactionId: string | null;
  href: string;
  site: { id: string; code: string; name: string };
  vehicleNumber: string | null;
  referenceNumber: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: { id: string; fullName: string } | null;
  resolvedAt: string | null;
  resolvedBy: { id: string; fullName: string } | null;
  createdAt: string;
};

export function notificationPath(record: {
  type: string;
  approvalId: string | null;
  transactionId: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): string {
  return notificationHref({
    type: record.type,
    approvalId: record.approvalId,
    transactionId: record.transactionId,
    ...(record.entityType === undefined ? {} : { entityType: record.entityType }),
    ...(record.entityId === undefined ? {} : { entityId: record.entityId }),
  });
}

export function toPublicNotification(record: Notification): PublicNotification {
  return {
    id: record.id,
    type: normalizeNotificationType(record.type),
    category: record.category,
    severity: record.severity,
    title: record.title,
    message: record.message,
    entityType: record.entityType,
    entityId: record.entityId,
    transactionId: record.transactionId,
    approvalId: record.approvalId,
    siteId: record.siteId,
    href: notificationPath(record),
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toPublicOperationalAlert(record: OperationalAlert & {
  site: { id: string; code: string; name: string };
  transaction: {
    referenceNumber: string;
    vehicle: { displayRegistrationNumber: string } | null;
  } | null;
  acknowledgedByUser: { id: string; fullName: string } | null;
  resolvedByUser: { id: string; fullName: string } | null;
}): PublicOperationalAlert {
  return {
    id: record.id,
    type: record.type,
    severity: record.severity,
    title: record.title,
    message: record.message,
    status: record.status,
    entityType: record.entityType,
    entityId: record.entityId,
    transactionId: record.transactionId,
    href: notificationHref({
      type: record.type,
      approvalId: record.entityType === "Approval" ? record.entityId : null,
      transactionId: record.transactionId,
      entityType: record.entityType,
      entityId: record.entityId,
    }),
    site: record.site,
    vehicleNumber: record.transaction?.vehicle?.displayRegistrationNumber ?? null,
    referenceNumber: record.transaction?.referenceNumber ?? null,
    acknowledgedAt: record.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: record.acknowledgedByUser,
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    resolvedBy: record.resolvedByUser,
    createdAt: record.createdAt.toISOString(),
  };
}

export const alertInclude = {
  site: { select: { id: true, code: true, name: true } },
  transaction: {
    select: {
      referenceNumber: true,
      vehicle: { select: { displayRegistrationNumber: true } },
    },
  },
  acknowledgedByUser: { select: { id: true, fullName: true } },
  resolvedByUser: { select: { id: true, fullName: true } },
} as const;
