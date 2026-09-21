import type { DependencyHealthStatus } from "../../domain/reliability/types.js";
import type { CommunicationState } from "../../domain/observability/deviceMonitor.js";
import type { MonitorGatewayStatus } from "../../domain/observability/gatewayMonitor.js";
import { incidentService, incidentTitle } from "../../domain/observability/incidents.js";

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

export type PublicMonitorProvider = {
  name: string;
  status: DependencyHealthStatus;
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

export function toPublicIncident(row: {
  id: string;
  type: string;
  title: string;
  severity: string;
  status: string;
  createdAt: Date;
  resolvedAt: Date | null;
  entityType: string | null;
  entityId: string | null;
  transactionId: string | null;
  eventKey: string;
}): PublicMonitorIncident {
  return {
    id: row.id,
    eventType: row.type,
    title: incidentTitle(row.type, row.eventKey),
    severity: row.severity,
    status: row.status,
    occurredAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    service: incidentService(row.type, row.eventKey, row.entityType),
    gatewayId: row.entityType === "EdgeGateway" ? row.entityId : null,
    deviceId: row.entityType === "EdgeDevice" || row.entityType === "Weighbridge" ? row.entityId : null,
    transactionId: row.transactionId,
    correlationId: null,
    eventKey: row.eventKey,
  };
}
