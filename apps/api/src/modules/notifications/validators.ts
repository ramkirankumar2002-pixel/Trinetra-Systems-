import { OperationalAlertStatus } from "@prisma/client";
import { zonedDayBounds } from "../../domain/siteDay.js";
import {
  isNotificationSeverity,
  isNotificationType,
  isOperationalAlertStatus,
  normalizeNotificationType,
  type NotificationSeverity,
  type NotificationType,
} from "../../domain/notificationCatalog.js";
import { parsePagination } from "../../domain/pagination.js";
import { HttpError } from "../../lib/httpError.js";
import { parseOptionalDate } from "../transactions/validators.js";
import { parseOptionalId } from "../dashboard/validators.js";

export type NotificationListFilters = {
  read: "all" | "unread" | "read";
  severity?: NotificationSeverity;
  type?: NotificationType;
  from?: Date;
  to?: Date;
};

export type AlertListFilters = {
  status?: OperationalAlertStatus;
  severity?: NotificationSeverity;
  type?: string;
  siteId?: string;
  from?: Date;
  to?: Date;
};

export function parseNotificationFilters(query: Record<string, unknown>): NotificationListFilters {
  const readRaw = query.read ?? query.status;
  let read: NotificationListFilters["read"] = "all";
  if (query.unread === "true" || query.unread === true || readRaw === "unread") {
    read = "unread";
  } else if (readRaw === "read") {
    read = "read";
  } else if (readRaw !== undefined && readRaw !== "" && readRaw !== "all") {
    throw new HttpError(400, "read must be all, unread, or read");
  }

  return {
    read,
    ...optionalSeverity(query.severity),
    ...optionalType(query.type),
    ...optionalRange(query.from, query.to),
  };
}

export function parseAlertFilters(query: Record<string, unknown>): AlertListFilters {
  const siteId = parseOptionalId(query.siteId, "site");
  return {
    ...optionalAlertStatus(query.status),
    ...optionalSeverity(query.severity),
    ...optionalAlertType(query.type),
    ...(siteId === undefined ? {} : { siteId }),
    ...optionalRange(query.from, query.to),
  };
}

export function parseNotificationPagination(query: Record<string, unknown>) {
  return parsePagination(query, { pageSize: 20, maxPageSize: 50 });
}

function optionalSeverity(value: unknown): { severity: NotificationSeverity } | Record<string, never> {
  if (value === undefined || value === "") {
    return {};
  }
  if (typeof value !== "string" || !isNotificationSeverity(value)) {
    throw new HttpError(400, "severity is invalid");
  }
  return { severity: value };
}

function optionalType(value: unknown): { type: NotificationType } | Record<string, never> {
  if (value === undefined || value === "") {
    return {};
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "type is invalid");
  }
  const normalized = normalizeNotificationType(value);
  if (!isNotificationType(normalized)) {
    throw new HttpError(400, "type is invalid");
  }
  return { type: normalized };
}

function optionalAlertType(value: unknown): { type: string } | Record<string, never> {
  if (value === undefined || value === "") {
    return {};
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "type is invalid");
  }
  return { type: normalizeNotificationType(value.trim()) };
}

function optionalAlertStatus(value: unknown): { status: OperationalAlertStatus } | Record<string, never> {
  if (value === undefined || value === "") {
    return {};
  }
  if (typeof value !== "string" || !isOperationalAlertStatus(value)) {
    throw new HttpError(400, "status is invalid");
  }
  return { status: value };
}

function optionalRange(fromValue: unknown, toValue: unknown): { from?: Date; to?: Date } {
  const from = parseBound(fromValue, "from");
  const to = parseBound(toValue, "to");
  if (from && to && from.getTime() > to.getTime()) {
    throw new HttpError(400, "from must be earlier than to");
  }
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  };
}

function parseBound(value: unknown, field: "from" | "to"): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a date`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const bounds = zonedDayBounds("Asia/Kolkata", value);
    return field === "from" ? bounds.start : new Date(bounds.end.getTime() - 1);
  }
  return parseOptionalDate(value, field);
}
