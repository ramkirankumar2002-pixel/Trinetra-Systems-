import type { PublicNotification } from "./api.ts";

export function notificationHref(notification: Pick<PublicNotification, "type" | "approvalId" | "transactionId" | "href">): string {
  if (notification.href) {
    return notification.href;
  }
  const type = notification.type === "APPROVAL_REQUESTED" ? "APPROVAL_REQUIRED" : notification.type;
  if (notification.approvalId && type.startsWith("APPROVAL_")) {
    return `/approvals/${notification.approvalId}`;
  }
  if (notification.transactionId) {
    return `/transactions/${notification.transactionId}`;
  }
  if (notification.type === "SYSTEM_ALERT" && notification.href === null) {
    return "/weighbridge/sync";
  }
  if (
    type === "BACKUP_FAILED" ||
    type === "BACKUP_RECOVERED" ||
    type === "STALE_TRANSACTION"
  ) {
    return type === "STALE_TRANSACTION" && notification.transactionId
      ? `/transactions/${notification.transactionId}`
      : "/reliability";
  }
  if (type === "SYSTEM_DEGRADED") {
    return "/monitoring";
  }
  if (type.startsWith("SUPPORT_TICKET")) {
    return "/support/tickets";
  }
  if (type.startsWith("SUPPORT_MAINTENANCE")) {
    return "/maintenance";
  }
  if (
    type === "GATEWAY_OFFLINE" ||
    type === "GATEWAY_RECOVERED" ||
    type === "SYNC_FAILURE" ||
    type === "SYNC_RECOVERED"
  ) {
    return "/weighbridge/sync";
  }
  return "/notifications";
}

export function formatNotificationType(type: string): string {
  return (type === "APPROVAL_REQUESTED" ? "APPROVAL_REQUIRED" : type).replaceAll("_", " ");
}

export function unreadLabel(count: number): string {
  if (count <= 0) {
    return "";
  }
  return count > 99 ? "99+" : String(count);
}
