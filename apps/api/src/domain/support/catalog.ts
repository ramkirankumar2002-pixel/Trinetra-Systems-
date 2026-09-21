export const SUPPORT_TICKET_CATEGORIES = [
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
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "WAITING_FOR_MAINTENANCE",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_ACTIVITY_TYPES = [
  "COMMENT",
  "INTERNAL_NOTE",
  "STATUS_CHANGE",
  "ASSIGNMENT",
  "PRIORITY_CHANGE",
  "MAINTENANCE",
  "RESOLUTION",
] as const;
export type SupportActivityType = (typeof SUPPORT_ACTIVITY_TYPES)[number];

export const SUPPORT_ACTIVITY_VISIBILITIES = ["CUSTOMER", "INTERNAL"] as const;
export type SupportActivityVisibility = (typeof SUPPORT_ACTIVITY_VISIBILITIES)[number];

export const SERVICE_MAINTENANCE_TYPES = [
  "CORRECTIVE",
  "PREVENTIVE",
  "INSPECTION",
  "CALIBRATION",
  "COMMISSIONING",
  "REPAIR",
  "OTHER",
] as const;
export type ServiceMaintenanceType = (typeof SERVICE_MAINTENANCE_TYPES)[number];

export const SERVICE_MAINTENANCE_STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ServiceMaintenanceStatus = (typeof SERVICE_MAINTENANCE_STATUSES)[number];

export const SUPPORT_PERMISSIONS = [
  { code: "support.ticket.create", name: "Create support tickets", group: "support" },
  { code: "support.ticket.read", name: "Read support tickets", group: "support" },
  { code: "support.ticket.comment", name: "Comment on support tickets", group: "support" },
  { code: "support.ticket.manage", name: "Assign and manage support tickets", group: "support" },
  { code: "support.internal", name: "View and write internal support notes", group: "support" },
  { code: "support.maintenance.read", name: "Read service maintenance records", group: "support" },
  { code: "support.maintenance.manage", name: "Create and complete service maintenance", group: "support" },
] as const;

export const SUPPORT_PERMISSION_CODES = SUPPORT_PERMISSIONS.map((permission) => permission.code);

export function isAdminAssignablePermission(code: string): boolean {
  return !code.startsWith("onboarding.") && code !== "support.internal";
}

export const CUSTOMER_SUPPORT_PERMISSIONS = [
  "support.ticket.create",
  "support.ticket.read",
  "support.ticket.comment",
] as const;

export const STAFF_SUPPORT_PERMISSIONS = [
  ...CUSTOMER_SUPPORT_PERMISSIONS,
  "support.ticket.manage",
  "support.maintenance.read",
  "support.maintenance.manage",
] as const;

export const SUPPORT_ENGINEER_PERMISSIONS = [
  ...STAFF_SUPPORT_PERMISSIONS,
  "support.internal",
  "user.read",
  "weighbridge.read",
  "gateway.read",
  "camera.read",
  "transaction.read",
  "dashboard.read",
  "security.read",
  "anomaly.read",
  "sync.read",
  "maintenance.manage",
] as const;

export const OPEN_TICKET_STATUSES: SupportTicketStatus[] = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "WAITING_FOR_CUSTOMER",
  "WAITING_FOR_MAINTENANCE",
];

export const ACTIVE_MAINTENANCE_STATUSES: ServiceMaintenanceStatus[] = ["SCHEDULED", "IN_PROGRESS"];

export function isSupportTicketCategory(value: string): value is SupportTicketCategory {
  return (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(value);
}

export function isSupportTicketPriority(value: string): value is SupportTicketPriority {
  return (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isSupportTicketStatus(value: string): value is SupportTicketStatus {
  return (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}

export function isSupportActivityType(value: string): value is SupportActivityType {
  return (SUPPORT_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isServiceMaintenanceType(value: string): value is ServiceMaintenanceType {
  return (SERVICE_MAINTENANCE_TYPES as readonly string[]).includes(value);
}

export function isServiceMaintenanceStatus(value: string): value is ServiceMaintenanceStatus {
  return (SERVICE_MAINTENANCE_STATUSES as readonly string[]).includes(value);
}
