export const INTEGRATION_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;
export type IntegrationStatusValue = (typeof INTEGRATION_STATUSES)[number];

export const INTEGRATION_ENVIRONMENTS = ["TEST", "PRODUCTION"] as const;
export type IntegrationEnvironmentValue = (typeof INTEGRATION_ENVIRONMENTS)[number];

export const INTEGRATION_SCOPES = [
  "ORGANIZATION_READ",
  "TRANSACTIONS_READ",
  "TRANSACTIONS_WRITE",
  "VEHICLES_READ",
  "VEHICLES_WRITE",
  "MATERIALS_READ",
  "WEIGHBRIDGES_READ",
  "WEIGHMENTS_READ",
  "REPORTS_READ",
  "DEVICES_READ",
  "EVENTS_READ",
  "DOCUMENTS_READ",
  "DOCUMENTS_WRITE",
  "NOTIFICATIONS_READ",
] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

export const DEFAULT_INTEGRATION_SCOPES: IntegrationScope[] = ["ORGANIZATION_READ"];

export const WEBHOOK_EVENT_TYPES = [
  "TRANSACTION_CREATED",
  "TRANSACTION_IDENTIFIED",
  "DOCUMENT_VERIFIED",
  "APPROVAL_REQUIRED",
  "APPROVAL_COMPLETED",
  "UNLOADING_STARTED",
  "UNLOADING_COMPLETED",
  "SECOND_WEIGHMENT_COMPLETED",
  "TRANSACTION_COMPLETED",
  "TRANSACTION_EXCEPTION",
  "WEIGHT_ANOMALY",
  "DEVICE_STATUS_CHANGED",
  "WEBHOOK_TEST",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const AUDIT_TO_WEBHOOK_EVENT: Record<string, WebhookEventType> = {
  TRANSACTION_CREATED: "TRANSACTION_CREATED",
  VEHICLE_IDENTIFIED: "TRANSACTION_IDENTIFIED",
  DOCUMENT_VERIFIED: "DOCUMENT_VERIFIED",
  APPROVAL_CREATED: "APPROVAL_REQUIRED",
  APPROVAL_APPROVED: "APPROVAL_COMPLETED",
  APPROVAL_REJECTED: "APPROVAL_COMPLETED",
  UNLOADING_STARTED: "UNLOADING_STARTED",
  UNLOADING_COMPLETED: "UNLOADING_COMPLETED",
  SECOND_WEIGHMENT_RECORDED: "SECOND_WEIGHMENT_COMPLETED",
  TRANSACTION_COMPLETED: "TRANSACTION_COMPLETED",
  TRANSACTION_EXCEPTION: "TRANSACTION_EXCEPTION",
  WEIGHT_ANOMALY_DETECTED: "WEIGHT_ANOMALY",
  EDGE_DEVICE_UPDATED: "DEVICE_STATUS_CHANGED",
  EDGE_DEVICE_ENABLED: "DEVICE_STATUS_CHANGED",
  EDGE_DEVICE_DISABLED: "DEVICE_STATUS_CHANGED",
  HARDWARE_ENABLED: "DEVICE_STATUS_CHANGED",
  HARDWARE_DISABLED: "DEVICE_STATUS_CHANGED",
};

export const TRINETRA_MAPPING_FIELDS = [
  "vehicleNumber",
  "materialCode",
  "supplierCode",
  "documentNumber",
  "transactionReference",
  "siteCode",
  "weighbridgeCode",
  "externalTransactionId",
  "purchaseOrderId",
  "deliveryReference",
] as const;

export const INTEGRATION_PERMISSIONS = [
  { code: "integration.read", name: "Read integration applications and delivery logs", group: "integration" },
  { code: "integration.manage", name: "Manage integration applications, credentials, and webhooks", group: "integration" },
] as const;

export const INTEGRATION_PERMISSION_CODES = INTEGRATION_PERMISSIONS.map((permission) => permission.code);

export const INTEGRATION_ADMIN_PERMISSIONS = ["integration.read", "integration.manage"] as const;

export const EXTERNAL_ERROR_CODES = [
  "AUTHENTICATION_FAILED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "RESOURCE_NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "VALIDATION_FAILED",
  "INTERNAL_ERROR",
] as const;
export type ExternalErrorCode = (typeof EXTERNAL_ERROR_CODES)[number];

export const API_VERSION = "v1" as const;
export const CURRENT_API_VERSION = "1.0" as const;

export function isIntegrationScope(value: string): value is IntegrationScope {
  return (INTEGRATION_SCOPES as readonly string[]).includes(value);
}

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export function isIntegrationStatus(value: string): value is IntegrationStatusValue {
  return (INTEGRATION_STATUSES as readonly string[]).includes(value);
}

export function isIntegrationEnvironment(value: string): value is IntegrationEnvironmentValue {
  return (INTEGRATION_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isTrinetraMappingField(value: string): boolean {
  return (TRINETRA_MAPPING_FIELDS as readonly string[]).includes(value);
}

export function scopeToInternalPermissions(scopes: readonly string[]): string[] {
  const permissions = new Set<string>();
  for (const scope of scopes) {
    switch (scope) {
      case "ORGANIZATION_READ":
        permissions.add("department.read");
        break;
      case "TRANSACTIONS_READ":
        permissions.add("transaction.read");
        break;
      case "TRANSACTIONS_WRITE":
        permissions.add("transaction.read");
        break;
      case "VEHICLES_READ":
        permissions.add("vehicle.read");
        break;
      case "VEHICLES_WRITE":
        permissions.add("vehicle.read");
        permissions.add("vehicle.manage");
        break;
      case "MATERIALS_READ":
        permissions.add("material.read");
        break;
      case "WEIGHBRIDGES_READ":
        permissions.add("weighbridge.read");
        break;
      case "WEIGHMENTS_READ":
        permissions.add("transaction.read");
        break;
      case "REPORTS_READ":
        permissions.add("report.read");
        break;
      case "DEVICES_READ":
        permissions.add("gateway.read");
        permissions.add("weighbridge.read");
        break;
      case "EVENTS_READ":
        permissions.add("anomaly.read");
        permissions.add("security.read");
        break;
      case "DOCUMENTS_READ":
        permissions.add("transaction.read");
        break;
      case "DOCUMENTS_WRITE":
        permissions.add("document.upload");
        break;
      case "NOTIFICATIONS_READ":
        permissions.add("transaction.read");
        break;
      default:
        break;
    }
  }
  return [...permissions];
}

export function externalErrorCodeFromStatus(status: number): ExternalErrorCode {
  if (status === 401) {
    return "AUTHENTICATION_FAILED";
  }
  if (status === 403) {
    return "FORBIDDEN";
  }
  if (status === 404) {
    return "RESOURCE_NOT_FOUND";
  }
  if (status === 409) {
    return "CONFLICT";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status === 400) {
    return "INVALID_REQUEST";
  }
  if (status === 422) {
    return "VALIDATION_FAILED";
  }
  if (status >= 500) {
    return "INTERNAL_ERROR";
  }
  return "INVALID_REQUEST";
}
