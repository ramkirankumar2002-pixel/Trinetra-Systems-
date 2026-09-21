export const MONITORING_ALERT_TYPES = [
  "GATEWAY_OFFLINE",
  "SYNC_FAILURE",
  "SYSTEM_DEGRADED",
  "STALE_TRANSACTION",
  "HIGH_API_ERROR_RATE",
  "SYSTEM_ALERT",
  "BACKUP_FAILED",
] as const;

export type MonitoringAlertType = (typeof MONITORING_ALERT_TYPES)[number];

export function isMonitoringAlertType(value: string): boolean {
  return (MONITORING_ALERT_TYPES as readonly string[]).includes(value);
}

export function incidentTitle(type: string, eventKey: string): string {
  if (type === "GATEWAY_OFFLINE") {
    return eventKey.includes("stale") ? "Gateway heartbeat stale" : "Gateway Offline";
  }
  if (type === "SYNC_FAILURE") {
    return "Synchronization Failure";
  }
  if (type === "HIGH_API_ERROR_RATE") {
    return "High API Error Rate";
  }
  if (type === "BACKUP_FAILED") {
    return "Backup Failed";
  }
  if (type === "STALE_TRANSACTION") {
    return "Stale Transaction";
  }
  if (type === "SYSTEM_DEGRADED") {
    if (eventKey.includes("postgresql") || eventKey.includes(":api:")) {
      return eventKey.includes("postgresql") ? "Database Unavailable" : "High API Error Rate";
    }
    if (eventKey.includes("weighbridge")) {
      return "Weight Provider Unavailable";
    }
    if (eventKey.includes("anpr")) {
      return "ANPR Provider Unavailable";
    }
    if (eventKey.includes("ocr")) {
      return "OCR Provider Unavailable";
    }
    if (eventKey.includes("offlineSync")) {
      return "Synchronization Failure";
    }
    if (eventKey.includes("edgeGateway")) {
      return "Gateway Offline";
    }
    return "System Degraded";
  }
  if (type === "WEIGHT_ANOMALY") {
    return "Weight anomaly";
  }
  return type.replaceAll("_", " ");
}

export function incidentService(type: string, eventKey: string, entityType: string | null): string {
  if (entityType) {
    return entityType;
  }
  if (type === "SYNC_FAILURE" || eventKey.includes("offlineSync")) {
    return "Synchronization";
  }
  if (type === "GATEWAY_OFFLINE" || eventKey.includes("edgeGateway")) {
    return "Gateway";
  }
  if (eventKey.includes("postgresql")) {
    return "Database";
  }
  if (type === "HIGH_API_ERROR_RATE" || eventKey.includes(":api:")) {
    return "API";
  }
  return "System";
}
