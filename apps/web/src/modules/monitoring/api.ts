import { apiRequest } from "../../shared/api/client.ts";

export type MonitorHealthStatus = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "DISABLED" | "SIMULATION";
export type MonitorGatewayStatus = "ONLINE" | "DEGRADED" | "STALE" | "OFFLINE" | "ERROR";
export type CommunicationState = "ONLINE" | "DEGRADED" | "OFFLINE" | "ERROR" | "DISABLED";

export type PublicMonitorService = {
  name: string;
  status: MonitorHealthStatus;
  detail: string;
  latencyMs?: number;
  simulated?: boolean;
};

export type PublicMonitorProvider = {
  name: string;
  status: MonitorHealthStatus;
  simulated: boolean;
  detail: string;
};

export type PublicMonitorIncident = {
  id: string;
  eventType: string;
  title: string;
  severity: string;
  status: string;
  occurredAt: string;
  resolvedAt: string | null;
  service: string;
  gatewayId: string | null;
  deviceId: string | null;
  transactionId: string | null;
  correlationId: string | null;
  eventKey: string;
};

export type PublicMonitorGateway = {
  id: string;
  code: string;
  name: string;
  site: { id: string; code: string; name: string };
  monitorStatus: MonitorGatewayStatus;
  runtimeStatus: string;
  lastHeartbeatAt: string | null;
  connectedDevices: number;
  pendingEvents: number;
  failedEvents: number;
  deadLetterEvents: number;
  syncStatus: string | null;
  softwareVersion: string | null;
  lastError: string | null;
};

export type PublicMonitorDevice = {
  id: string;
  name: string;
  deviceType: string;
  source: "EDGE" | "WEIGHBRIDGE" | "CAMERA";
  gatewayId: string | null;
  gatewayCode: string | null;
  communication: CommunicationState;
  lastCommunicationAt: string | null;
  errorState: string | null;
  simulated: boolean;
};

export type OperationalMetrics = {
  apiRequests: number;
  apiErrors: number;
  apiLatencyMs: number | null;
  activeSessions: number;
  transactionsCreated: number;
  transactionsCompleted: number;
  transactionsInProgress: number;
  transactionsWithExceptions: number;
  pendingApprovals: number;
  approved: number;
  rejected: number;
  pendingUnloading: number;
  activeUnloading: number;
  completedUnloading: number;
  staleUnloading: number;
  openSecurityEvents: number;
  weightAnomalies: number;
  pendingSyncEvents: number;
  failedSyncEvents: number;
  deadLetterEvents: number;
  offlineGateways: number;
};

export type MonitoringStatus = {
  systemStatus: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  services: PublicMonitorService[];
  providers: PublicMonitorProvider[];
  operational: OperationalMetrics;
  currentIssues: {
    openAlerts: number;
    offlineGateways: number;
    failedSynchronization: number;
    staleTransactions: number;
    providerFailures: number;
  };
  incidents: PublicMonitorIncident[];
  development: {
    environment: string;
    simulationMode: boolean;
    simulators: {
      gateway: boolean;
      anpr: boolean;
      weighbridge: boolean;
      ocr: boolean;
      voice: boolean;
      sync: boolean;
    };
  } | null;
  refreshIntervalMs: number;
  metricsLimitation: string;
};

export function getMonitoringStatus(): Promise<{ status: MonitoringStatus }> {
  return apiRequest("/api/v1/monitoring/status");
}

export function getMonitorGateways(): Promise<{ items: PublicMonitorGateway[] }> {
  return apiRequest("/api/v1/monitoring/gateways");
}

export function getMonitorDevices(): Promise<{ items: PublicMonitorDevice[] }> {
  return apiRequest("/api/v1/monitoring/devices");
}

export function getMonitorIncidents(): Promise<{ items: PublicMonitorIncident[]; total: number }> {
  return apiRequest("/api/v1/monitoring/incidents");
}

export function serviceLabel(name: string): string {
  switch (name) {
    case "postgresql":
      return "Database";
    case "backend":
      return "Backend";
    case "edgeGateway":
      return "Gateway";
    case "offlineSync":
      return "Synchronization";
    case "notifications":
      return "Notifications";
    case "weighbridge":
      return "Weighbridge";
    case "anpr":
      return "ANPR";
    case "ocr":
      return "OCR";
    case "voice":
      return "Voice";
    default:
      return name;
  }
}

export function monitoringPollMs(configured: string | undefined, fallback = 45_000): number {
  if (!configured) {
    return fallback;
  }
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 30_000 || parsed > 120_000) {
    return fallback;
  }
  return parsed;
}
