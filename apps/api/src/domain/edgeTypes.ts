export const EDGE_GATEWAY_STATUSES = ["PENDING", "ONLINE", "OFFLINE", "DISABLED", "REVOKED"] as const;
export type EdgeGatewayStatusValue = (typeof EDGE_GATEWAY_STATUSES)[number];

export const EDGE_DEVICE_TYPES = [
  "WEIGHBRIDGE_INDICATOR",
  "CAMERA",
  "SCANNER",
  "BARCODE_SCANNER",
  "SENSOR",
  "PLC",
  "OTHER",
] as const;
export type EdgeDeviceTypeValue = (typeof EDGE_DEVICE_TYPES)[number];

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
export type EdgeEventTypeValue = (typeof EDGE_EVENT_TYPES)[number];

export {
  EDGE_QUEUE_STATUSES,
  type EdgeQueueStatusValue,
} from "./edgeQueue.js";

export const EDGE_INGEST_STATUSES = ["RECEIVED", "PROCESSED", "REJECTED"] as const;
export type EdgeIngestStatusValue = (typeof EDGE_INGEST_STATUSES)[number];

export function isEdgeDeviceType(value: string): value is EdgeDeviceTypeValue {
  return (EDGE_DEVICE_TYPES as readonly string[]).includes(value);
}

export function isEdgeEventType(value: string): value is EdgeEventTypeValue {
  return (EDGE_EVENT_TYPES as readonly string[]).includes(value);
}

export function expectedDeviceTypeForEvent(eventType: EdgeEventTypeValue): EdgeDeviceTypeValue[] {
  switch (eventType) {
    case "DEVICE_WEIGHT_READING":
      return ["WEIGHBRIDGE_INDICATOR"];
    case "DEVICE_ANPR_DETECTION":
      return ["CAMERA"];
    case "DEVICE_SCAN_COMPLETED":
      return ["SCANNER", "BARCODE_SCANNER"];
    case "DEVICE_STATUS_CHANGED":
    case "LOCAL_TRANSACTION_CREATED":
    case "LOCAL_TRANSACTION_STATE":
    case "LOCAL_WEIGHT_ANOMALY":
    case "LOCAL_FILE_CAPTURED":
    case "CONNECTIVITY_CHANGED":
      return [...EDGE_DEVICE_TYPES];
    default: {
      const _exhaustive: never = eventType;
      return _exhaustive;
    }
  }
}
