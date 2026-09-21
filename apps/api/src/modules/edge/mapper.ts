import type { EdgeDevice, EdgeGateway, EdgeIngestedEvent, Site } from "@prisma/client";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { stripSecretFields } from "../../domain/edgeSecrets.js";
import type { PublicEdgeDevice, PublicEdgeGateway, PublicEdgeIngestResult } from "./types.js";

type GatewayRow = EdgeGateway & { site: Pick<Site, "id" | "code" | "name"> };

export function toPublicGateway(
  row: GatewayRow,
  nowMs: number,
  offlineTimeoutMs: number,
): PublicEdgeGateway {
  const status = deriveGatewayRuntimeStatus({
    enabled: row.enabled,
    revokedAt: row.revokedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    nowMs,
    offlineTimeoutMs,
  });

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status,
    enabled: row.enabled,
    revoked: row.revokedAt !== null,
    site: { id: row.site.id, code: row.site.code, name: row.site.name },
    softwareVersion: row.softwareVersion,
    buildEnvironment: row.buildEnvironment,
    platform: row.platform,
    connectedDeviceCount: row.connectedDeviceCount,
    lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
    lastCommunicationAt: row.lastCommunicationAt?.toISOString() ?? null,
    lastError: row.lastError,
    registeredAt: row.registeredAt.toISOString(),
  };
}

export function toPublicDevice(row: EdgeDevice): PublicEdgeDevice {
  return {
    id: row.id,
    gatewayId: row.gatewayId,
    code: row.code,
    name: row.name,
    deviceType: row.deviceType,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serialNumber,
    protocol: row.protocol,
    connectionType: row.connectionType,
    provider: row.provider,
    weighbridgeId: row.weighbridgeId,
    cameraId: row.cameraId,
    enabled: row.enabled,
    status: row.status,
    lastCommunicationAt: row.lastCommunicationAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastReadingSummary: stripSecretFields(row.lastReadingSummary),
    configurationRef: stripSecretFields(row.configurationRef),
    firmwareVersion: row.firmwareVersion,
    notes: row.notes,
    host: row.host,
    port: row.port,
    serialPort: row.serialPort,
    adapterKey: row.adapterKey,
    protocolReadiness: row.protocolReadiness,
    installationStatus: row.installationStatus,
    lastDiagnostic: stripSecretFields(row.lastDiagnostic),
    lastClockIssue: row.lastClockIssue,
  };
}

export function toPublicIngestResult(
  row: EdgeIngestedEvent,
  alreadyProcessed: boolean,
): PublicEdgeIngestResult {
  return {
    eventId: row.eventId,
    alreadyProcessed,
    status: row.status,
    eventType: row.eventType,
    weighmentId: row.weighmentId,
    anprDetectionId: row.anprDetectionId,
    documentId: row.documentId,
    resultSummary: stripSecretFields(row.resultSummary),
  };
}
