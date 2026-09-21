import type { Request } from "express";
import type { EdgeDeviceType, EdgeEventType, EdgeGatewayStatus, HardwareDeviceStatus } from "@prisma/client";

export type AuthenticatedGateway = {
  id: string;
  organizationId: string;
  organizationStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  siteId: string;
  code: string;
  name: string;
  enabled: boolean;
  status: EdgeGatewayStatus;
};

export type GatewayRequest = Request & {
  gateway: AuthenticatedGateway;
};

export type PublicEdgeGateway = {
  id: string;
  code: string;
  name: string;
  status: EdgeGatewayStatus;
  enabled: boolean;
  revoked: boolean;
  site: { id: string; code: string; name: string };
  softwareVersion: string | null;
  buildEnvironment: string | null;
  platform: string | null;
  connectedDeviceCount: number;
  lastHeartbeatAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
  registeredAt: string;
};

export type PublicEdgeDevice = {
  id: string;
  gatewayId: string;
  code: string;
  name: string;
  deviceType: EdgeDeviceType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  protocol: string | null;
  connectionType: string | null;
  provider: string;
  weighbridgeId: string | null;
  cameraId: string | null;
  enabled: boolean;
  status: HardwareDeviceStatus;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastReadingSummary: unknown;
  configurationRef: unknown;
  firmwareVersion: string | null;
  notes: string | null;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  adapterKey: string | null;
  protocolReadiness: string;
  installationStatus: string;
  lastDiagnostic: unknown;
  lastClockIssue: string | null;
};

export type PublicEdgeIngestResult = {
  eventId: string;
  alreadyProcessed: boolean;
  status: "RECEIVED" | "PROCESSED" | "REJECTED";
  eventType: EdgeEventType;
  weighmentId: string | null;
  anprDetectionId: string | null;
  documentId: string | null;
  resultSummary: unknown;
};
