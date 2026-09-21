export const NOTIFICATION_TYPES = [
  "APPROVAL_REQUIRED",
  "APPROVAL_APPROVED",
  "APPROVAL_REJECTED",
  "DOCUMENT_REVIEW_REQUIRED",
  "DOCUMENT_VERIFIED",
  "UNLOADING_ASSIGNED",
  "UNLOADING_STARTED",
  "UNLOADING_COMPLETED",
  "SECOND_WEIGHMENT_REQUIRED",
  "TRANSACTION_COMPLETED",
  "TRANSACTION_EXCEPTION",
  "WEIGHT_EXCEPTION",
  "WORKFLOW_EXCEPTION",
  "SYSTEM_ALERT",
  "WEIGHT_ANOMALY",
  "BACKUP_FAILED",
  "BACKUP_RECOVERED",
  "GATEWAY_OFFLINE",
  "GATEWAY_RECOVERED",
  "SYNC_FAILURE",
  "SYNC_RECOVERED",
  "STALE_TRANSACTION",
  "SYSTEM_DEGRADED",
  "SUPPORT_TICKET_CREATED",
  "SUPPORT_TICKET_CRITICAL",
  "SUPPORT_TICKET_ASSIGNED",
  "SUPPORT_MAINTENANCE_STARTED",
  "SUPPORT_MAINTENANCE_COMPLETED",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_CATEGORIES = ["WORKFLOW", "APPROVAL", "EXCEPTION", "SYSTEM"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const OPERATIONAL_ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export type OperationalAlertStatus = (typeof OPERATIONAL_ALERT_STATUSES)[number];

export type RecipientRule =
  | "APPROVAL_DECIDERS"
  | "DOCUMENT_VERIFIERS"
  | "UNLOADING_CREW"
  | "WEIGHBRIDGE_OPERATORS"
  | "OPERATIONS"
  | "EXCEPTION_WATCHERS"
  | "MANAGEMENT";

export type NotificationDefinition = {
  type: NotificationType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  recipientRule: RecipientRule;
  createAlert: boolean;
  permissions: string[];
};

export const NOTIFICATION_DEFINITIONS: Record<NotificationType, NotificationDefinition> = {
  APPROVAL_REQUIRED: {
    type: "APPROVAL_REQUIRED",
    category: "APPROVAL",
    severity: "WARNING",
    recipientRule: "APPROVAL_DECIDERS",
    createAlert: true,
    permissions: ["approval.decide"],
  },
  APPROVAL_APPROVED: {
    type: "APPROVAL_APPROVED",
    category: "APPROVAL",
    severity: "SUCCESS",
    recipientRule: "OPERATIONS",
    createAlert: false,
    permissions: ["weighment.record", "transaction.create", "transaction.update", "dashboard.read"],
  },
  APPROVAL_REJECTED: {
    type: "APPROVAL_REJECTED",
    category: "APPROVAL",
    severity: "ERROR",
    recipientRule: "OPERATIONS",
    createAlert: false,
    permissions: ["weighment.record", "transaction.create", "transaction.update", "dashboard.read"],
  },
  DOCUMENT_REVIEW_REQUIRED: {
    type: "DOCUMENT_REVIEW_REQUIRED",
    category: "WORKFLOW",
    severity: "WARNING",
    recipientRule: "DOCUMENT_VERIFIERS",
    createAlert: true,
    permissions: ["document.verify"],
  },
  DOCUMENT_VERIFIED: {
    type: "DOCUMENT_VERIFIED",
    category: "WORKFLOW",
    severity: "SUCCESS",
    recipientRule: "WEIGHBRIDGE_OPERATORS",
    createAlert: false,
    permissions: ["weighment.record", "transaction.create", "document.upload"],
  },
  UNLOADING_ASSIGNED: {
    type: "UNLOADING_ASSIGNED",
    category: "WORKFLOW",
    severity: "INFO",
    recipientRule: "UNLOADING_CREW",
    createAlert: false,
    permissions: ["unloading.assign", "unloading.manage"],
  },
  UNLOADING_STARTED: {
    type: "UNLOADING_STARTED",
    category: "WORKFLOW",
    severity: "INFO",
    recipientRule: "UNLOADING_CREW",
    createAlert: false,
    permissions: ["unloading.assign", "unloading.manage"],
  },
  UNLOADING_COMPLETED: {
    type: "UNLOADING_COMPLETED",
    category: "WORKFLOW",
    severity: "SUCCESS",
    recipientRule: "UNLOADING_CREW",
    createAlert: false,
    permissions: ["unloading.assign", "unloading.manage", "weighment.record"],
  },
  SECOND_WEIGHMENT_REQUIRED: {
    type: "SECOND_WEIGHMENT_REQUIRED",
    category: "WORKFLOW",
    severity: "WARNING",
    recipientRule: "WEIGHBRIDGE_OPERATORS",
    createAlert: true,
    permissions: ["weighment.record"],
  },
  TRANSACTION_COMPLETED: {
    type: "TRANSACTION_COMPLETED",
    category: "WORKFLOW",
    severity: "SUCCESS",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["dashboard.read", "report.read", "transaction.finalize"],
  },
  TRANSACTION_EXCEPTION: {
    type: "TRANSACTION_EXCEPTION",
    category: "EXCEPTION",
    severity: "ERROR",
    recipientRule: "EXCEPTION_WATCHERS",
    createAlert: true,
    permissions: ["dashboard.read", "report.read", "transaction.correct"],
  },
  WEIGHT_EXCEPTION: {
    type: "WEIGHT_EXCEPTION",
    category: "EXCEPTION",
    severity: "ERROR",
    recipientRule: "EXCEPTION_WATCHERS",
    createAlert: true,
    permissions: ["dashboard.read", "report.read", "transaction.correct", "weighment.record"],
  },
  WORKFLOW_EXCEPTION: {
    type: "WORKFLOW_EXCEPTION",
    category: "EXCEPTION",
    severity: "ERROR",
    recipientRule: "EXCEPTION_WATCHERS",
    createAlert: true,
    permissions: ["dashboard.read", "report.read", "transaction.correct"],
  },
  SYSTEM_ALERT: {
    type: "SYSTEM_ALERT",
    category: "SYSTEM",
    severity: "ERROR",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: [
      "dashboard.read",
      "weighbridge.read",
      "weighbridge.manage",
      "camera.read",
      "camera.manage",
      "gateway.read",
      "gateway.manage",
    ],
  },
  WEIGHT_ANOMALY: {
    type: "WEIGHT_ANOMALY",
    category: "EXCEPTION",
    severity: "WARNING",
    recipientRule: "EXCEPTION_WATCHERS",
    createAlert: true,
    permissions: [
      "anomaly.read",
      "security.read",
      "weighbridge.read",
      "dashboard.read",
      "report.read",
    ],
  },
  BACKUP_FAILED: {
    type: "BACKUP_FAILED",
    category: "SYSTEM",
    severity: "ERROR",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: ["reliability.read", "report.read", "audit.read"],
  },
  BACKUP_RECOVERED: {
    type: "BACKUP_RECOVERED",
    category: "SYSTEM",
    severity: "SUCCESS",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["reliability.read", "report.read", "audit.read"],
  },
  GATEWAY_OFFLINE: {
    type: "GATEWAY_OFFLINE",
    category: "SYSTEM",
    severity: "ERROR",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: ["gateway.read", "sync.read", "reliability.read", "weighbridge.manage"],
  },
  GATEWAY_RECOVERED: {
    type: "GATEWAY_RECOVERED",
    category: "SYSTEM",
    severity: "SUCCESS",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["gateway.read", "sync.read", "reliability.read"],
  },
  SYNC_FAILURE: {
    type: "SYNC_FAILURE",
    category: "SYSTEM",
    severity: "ERROR",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: ["sync.read", "sync.manage", "reliability.read"],
  },
  SYNC_RECOVERED: {
    type: "SYNC_RECOVERED",
    category: "SYSTEM",
    severity: "SUCCESS",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["sync.read", "reliability.read"],
  },
  STALE_TRANSACTION: {
    type: "STALE_TRANSACTION",
    category: "WORKFLOW",
    severity: "WARNING",
    recipientRule: "OPERATIONS",
    createAlert: true,
    permissions: ["dashboard.read", "transaction.read", "reliability.read"],
  },
  SYSTEM_DEGRADED: {
    type: "SYSTEM_DEGRADED",
    category: "SYSTEM",
    severity: "WARNING",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: ["reliability.read", "report.read", "monitoring.read"],
  },
  SUPPORT_TICKET_CREATED: {
    type: "SUPPORT_TICKET_CREATED",
    category: "SYSTEM",
    severity: "WARNING",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["support.ticket.manage", "support.ticket.read"],
  },
  SUPPORT_TICKET_CRITICAL: {
    type: "SUPPORT_TICKET_CRITICAL",
    category: "SYSTEM",
    severity: "CRITICAL",
    recipientRule: "MANAGEMENT",
    createAlert: true,
    permissions: ["support.ticket.manage"],
  },
  SUPPORT_TICKET_ASSIGNED: {
    type: "SUPPORT_TICKET_ASSIGNED",
    category: "SYSTEM",
    severity: "INFO",
    recipientRule: "OPERATIONS",
    createAlert: false,
    permissions: ["support.ticket.manage", "support.ticket.read"],
  },
  SUPPORT_MAINTENANCE_STARTED: {
    type: "SUPPORT_MAINTENANCE_STARTED",
    category: "SYSTEM",
    severity: "INFO",
    recipientRule: "MANAGEMENT",
    createAlert: false,
    permissions: ["support.maintenance.read", "maintenance.manage"],
  },
  SUPPORT_MAINTENANCE_COMPLETED: {
    type: "SUPPORT_MAINTENANCE_COMPLETED",
    category: "SYSTEM",
    severity: "SUCCESS",
    recipientRule: "OPERATIONS",
    createAlert: false,
    permissions: ["support.maintenance.read", "support.ticket.read"],
  },
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationSeverity(value: string): value is NotificationSeverity {
  return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value);
}

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function isOperationalAlertStatus(value: string): value is OperationalAlertStatus {
  return (OPERATIONAL_ALERT_STATUSES as readonly string[]).includes(value);
}

export function normalizeNotificationType(value: string): string {
  return value === "APPROVAL_REQUESTED" ? "APPROVAL_REQUIRED" : value;
}

export function getNotificationDefinition(type: NotificationType): NotificationDefinition {
  return NOTIFICATION_DEFINITIONS[type];
}

export const EVENT_KEYS = {
  approvalRequired: (approvalId: string) => `approval.required:${approvalId}`,
  approvalApproved: (approvalId: string) => `approval.approved:${approvalId}`,
  approvalRejected: (approvalId: string) => `approval.rejected:${approvalId}`,
  documentReview: (documentId: string) => `document.review:${documentId}`,
  documentVerified: (documentId: string) => `document.verified:${documentId}`,
  unloadingAssigned: (transactionId: string, pointId: string, assignedAt: string) =>
    `unloading.assigned:${transactionId}:${pointId}:${assignedAt}`,
  unloadingStarted: (transactionId: string) => `unloading.started:${transactionId}`,
  unloadingCompleted: (transactionId: string) => `unloading.completed:${transactionId}`,
  secondWeighment: (transactionId: string) => `second.weighment:${transactionId}`,
  transactionCompleted: (transactionId: string) => `transaction.completed:${transactionId}`,
  weightException: (transactionId: string) => `weight.exception:${transactionId}`,
  transactionException: (transactionId: string) => `transaction.exception:${transactionId}`,
  workflowException: (transactionId: string, reason: string) => `workflow.exception:${transactionId}:${reason}`,
  systemAlert: (key: string) => `system:${key}`,
  hardwareDisconnected: (weighbridgeId: string, incidentKey: string) =>
    `hardware.disconnected:${weighbridgeId}:${incidentKey}`,
  hardwareConnectionFailed: (weighbridgeId: string, incidentKey: string) =>
    `hardware.connection_failed:${weighbridgeId}:${incidentKey}`,
  hardwareRecovered: (weighbridgeId: string, incidentKey: string) =>
    `hardware.recovered:${weighbridgeId}:${incidentKey}`,
  hardwareNoData: (weighbridgeId: string, incidentKey: string) =>
    `hardware.no_data:${weighbridgeId}:${incidentKey}`,
  hardwareInvalid: (weighbridgeId: string, incidentKey: string) =>
    `hardware.invalid:${weighbridgeId}:${incidentKey}`,
  cameraDisconnected: (cameraId: string, incidentKey: string) => `camera.disconnected:${cameraId}:${incidentKey}`,
  anprUnavailable: (cameraId: string, incidentKey: string) => `anpr.unavailable:${cameraId}:${incidentKey}`,
  anprRepeatedFailure: (cameraId: string, windowKey: string) => `anpr.repeated_failure:${cameraId}:${windowKey}`,
  vehicleUnregistered: (cameraId: string, plate: string) => {
    const day = new Date().toISOString().slice(0, 10);
    return `vehicle.unregistered:${cameraId}:${plate}:${day}`;
  },
  manualIdentificationRequired: (cameraId: string, windowKey: string) =>
    `anpr.manual_required:${cameraId}:${windowKey}`,
  gatewayOffline: (gatewayId: string, incidentKey: string) => `gateway.offline:${gatewayId}:${incidentKey}`,
  edgeDeviceUnhealthy: (deviceId: string, incidentKey: string) =>
    `edge.device_unhealthy:${deviceId}:${incidentKey}`,
  weightAnomaly: (eventId: string) => `weight.anomaly:${eventId}`,
  syncConflict: (conflictId: string) => `sync.conflict:${conflictId}`,
  syncDeadLetter: (eventId: string) => `sync.dead_letter:${eventId}`,
  edgeStorageLimit: (gatewayId: string) => `edge.storage:${gatewayId}`,
  configStale: (gatewayId: string) => `edge.config_stale:${gatewayId}`,
  backupFailed: (day: string) => `backup.failed:${day}`,
  backupRecovered: (runId: string) => `backup.recovered:${runId}`,
  gatewayStale: (gatewayId: string, day: string) => `gateway.stale:${gatewayId}:${day}`,
  gatewayRecovered: (gatewayId: string, incidentKey: string) => `gateway.recovered:${gatewayId}:${incidentKey}`,
  syncFailure: (gatewayId: string, day: string) => `sync.failure:${gatewayId}:${day}`,
  syncRecovered: (gatewayId: string, day: string) => `sync.recovered:${gatewayId}:${day}`,
  staleTransaction: (transactionId: string) => `stale.transaction:${transactionId}`,
  systemDegraded: (component: string, day: string) => `system.degraded:${component}:${day}`,
  supportTicketCreated: (ticketId: string) => `support.ticket.created:${ticketId}`,
  supportTicketAssigned: (ticketId: string) => `support.ticket.assigned:${ticketId}`,
  supportTicketCritical: (ticketId: string) => `support.ticket.critical:${ticketId}`,
  supportMaintenanceStarted: (recordId: string) => `support.maintenance.started:${recordId}`,
  supportMaintenanceCompleted: (recordId: string) => `support.maintenance.completed:${recordId}`,
} as const;

export const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  CRITICAL: 5,
  ERROR: 4,
  WARNING: 3,
  SUCCESS: 2,
  INFO: 1,
};

export type NotificationHrefInput = {
  type: string;
  approvalId: string | null;
  transactionId: string | null;
  entityType?: string | null;
  entityId?: string | null;
  canOpenApproval?: boolean;
};

export function notificationHref(input: NotificationHrefInput): string {
  const type = normalizeNotificationType(input.type);
  if (
    input.approvalId &&
    (type === "APPROVAL_REQUIRED" || type === "APPROVAL_APPROVED" || type === "APPROVAL_REJECTED")
  ) {
    return input.canOpenApproval === false ? `/transactions/${input.transactionId ?? ""}` : `/approvals/${input.approvalId}`;
  }
  if (input.transactionId) {
    return `/transactions/${input.transactionId}`;
  }
  if (input.entityType === "Transaction" && input.entityId) {
    return `/transactions/${input.entityId}`;
  }
  if (input.entityType === "WeightAnomalyEvent" && input.entityId) {
    return `/weighbridge/anomalies/${input.entityId}`;
  }
  if (input.entityType === "Weighbridge" || input.entityType === "WeighbridgeHardwareProfile") {
    return "/weighbridge/devices";
  }
  if (input.entityType === "SupportTicket" && input.entityId) {
    return `/support/tickets/${input.entityId}`;
  }
  if (input.entityType === "ServiceMaintenanceRecord" && input.entityId) {
    return `/maintenance/${input.entityId}`;
  }
  if (input.entityType === "EdgeGateway" || input.entityType === "EdgeDevice") {
    return "/weighbridge/gateways";
  }
  if (input.entityType === "BackupRun" || type === "BACKUP_FAILED" || type === "BACKUP_RECOVERED" || type === "SYSTEM_DEGRADED") {
    return type === "SYSTEM_DEGRADED" ? "/monitoring" : "/reliability";
  }
  return "/notifications";
}

export function alertHref(input: { approvalId?: string | null; transactionId: string | null; type: string }): string {
  if (input.approvalId && input.type === "APPROVAL_REQUIRED") {
    return `/approvals/${input.approvalId}`;
  }
  if (input.transactionId) {
    return `/transactions/${input.transactionId}`;
  }
  if (input.type === "SYSTEM_ALERT") {
    return "/weighbridge/devices";
  }
  if (input.type === "WEIGHT_ANOMALY") {
    return "/weighbridge/anomalies";
  }
  if (
    input.type === "BACKUP_FAILED" ||
    input.type === "BACKUP_RECOVERED"
  ) {
    return "/reliability";
  }
  if (input.type === "SYSTEM_DEGRADED") {
    return "/monitoring";
  }
  if (
    input.type === "GATEWAY_OFFLINE" ||
    input.type === "GATEWAY_RECOVERED" ||
    input.type === "SYNC_FAILURE" ||
    input.type === "SYNC_RECOVERED"
  ) {
    return "/weighbridge/sync";
  }
  return "/dashboard";
}
