export const EDGE_EVENT_TYPES = [
  "DEVICE_WEIGHT_READING",
  "DEVICE_ANPR_DETECTION",
  "DEVICE_STATUS_CHANGED",
  "DEVICE_SCAN_COMPLETED",
  "LOCAL_TRANSACTION_CREATED",
  "LOCAL_TRANSACTION_STATE",
  "LOCAL_WEIGHT_ANOMALY",
  "LOCAL_FILE_CAPTURED",
  "CONNECTIVITY_CHANGED",
] as const;

export type EdgeEventType = (typeof EDGE_EVENT_TYPES)[number];

export type EdgeDeviceType =
  | "WEIGHBRIDGE_INDICATOR"
  | "CAMERA"
  | "SCANNER"
  | "BARCODE_SCANNER"
  | "SENSOR"
  | "PLC"
  | "OTHER";

export type EdgeEventEnvelope = {
  eventId: string;
  gatewayId: string;
  organizationId?: string;
  siteId?: string;
  deviceId: string;
  deviceType: EdgeDeviceType;
  eventType: EdgeEventType;
  timestamp: string;
  gatewayReceiveTime: string;
  sequence: string | null;
  softwareVersion: string;
  payload: Record<string, unknown>;
};

export function createEnvelope(input: {
  eventId: string;
  gatewayId: string;
  organizationId?: string;
  siteId?: string;
  deviceId: string;
  deviceType: EdgeDeviceType;
  eventType: EdgeEventType;
  deviceEventTime: string;
  gatewayReceiveTime: string;
  sequence?: string | null;
  softwareVersion: string;
  payload: Record<string, unknown>;
}): EdgeEventEnvelope {
  return {
    eventId: input.eventId,
    gatewayId: input.gatewayId,
    ...(input.organizationId === undefined ? {} : { organizationId: input.organizationId }),
    ...(input.siteId === undefined ? {} : { siteId: input.siteId }),
    deviceId: input.deviceId,
    deviceType: input.deviceType,
    eventType: input.eventType,
    timestamp: input.deviceEventTime,
    gatewayReceiveTime: input.gatewayReceiveTime,
    sequence: input.sequence ?? null,
    softwareVersion: input.softwareVersion,
    payload: input.payload,
  };
}
