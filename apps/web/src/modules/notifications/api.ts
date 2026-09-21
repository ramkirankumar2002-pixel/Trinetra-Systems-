import { apiRequest } from "../../shared/api/client.ts";

export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "CRITICAL";
export type NotificationCategory = "WORKFLOW" | "APPROVAL" | "EXCEPTION" | "SYSTEM";
export type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

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

export type NotificationListResponse = {
  items: PublicNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unreadCount: number;
  bySeverity: Array<{ severity: NotificationSeverity; count: number }>;
  byType: Array<{ type: string; count: number }>;
};

export type PublicOperationalAlert = {
  id: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  status: AlertStatus;
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

export type AlertListResponse = {
  items: PublicOperationalAlert[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function listNotifications(search: URLSearchParams): Promise<NotificationListResponse> {
  return apiRequest<NotificationListResponse>(`/api/v1/notifications?${search.toString()}`);
}

export function getUnreadCount(): Promise<Pick<NotificationListResponse, "unreadCount" | "bySeverity" | "byType">> {
  return apiRequest(`/api/v1/notifications/unread-count`);
}

export function markNotificationRead(id: string): Promise<{ notification: PublicNotification }> {
  return apiRequest<{ notification: PublicNotification }>(`/api/v1/notifications/${id}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function markAllNotificationsRead(): Promise<{ updated: number; unreadCount: number }> {
  return apiRequest(`/api/v1/notifications/read-all`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listAlerts(search: URLSearchParams): Promise<AlertListResponse> {
  return apiRequest<AlertListResponse>(`/api/v1/alerts?${search.toString()}`);
}

export function acknowledgeAlert(id: string): Promise<{ alert: PublicOperationalAlert }> {
  return apiRequest<{ alert: PublicOperationalAlert }>(`/api/v1/alerts/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function resolveAlert(id: string): Promise<{ alert: PublicOperationalAlert }> {
  return apiRequest<{ alert: PublicOperationalAlert }>(`/api/v1/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
