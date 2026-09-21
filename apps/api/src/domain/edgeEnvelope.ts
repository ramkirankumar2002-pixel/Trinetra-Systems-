import {
  expectedDeviceTypeForEvent,
  isEdgeDeviceType,
  isEdgeEventType,
  type EdgeDeviceTypeValue,
  type EdgeEventTypeValue,
} from "./edgeTypes.js";
import { rejectSecretFields } from "./edgeSecrets.js";

export type EdgeEventEnvelope = {
  eventId: string;
  gatewayId: string;
  deviceId: string;
  deviceType: EdgeDeviceTypeValue;
  eventType: EdgeEventTypeValue;
  timestamp: string;
  gatewayReceiveTime: string;
  sequence: string | null;
  softwareVersion: string | null;
  payload: Record<string, unknown>;
};

const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SYNC_EVENT_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;

export function parseEdgeEventEnvelope(
  body: unknown,
  nowMs: number,
  options?: { maxAgeMs?: number },
): EdgeEventEnvelope | string {
  if (typeof body !== "object" || body === null) {
    return "An event envelope is required";
  }

  const record = body as Record<string, unknown>;
  const eventId = readId(record.eventId, "eventId");
  if (typeof eventId !== "string") {
    return eventId;
  }
  const gatewayId = readNonEmpty(record.gatewayId, "gatewayId");
  if (typeof gatewayId !== "string") {
    return gatewayId;
  }
  const deviceId = readNonEmpty(record.deviceId, "deviceId");
  if (typeof deviceId !== "string") {
    return deviceId;
  }
  if (typeof record.deviceType !== "string" || !isEdgeDeviceType(record.deviceType)) {
    return "Unsupported device type";
  }
  if (typeof record.eventType !== "string" || !isEdgeEventType(record.eventType)) {
    return "Unsupported event type";
  }
  const allowed = expectedDeviceTypeForEvent(record.eventType);
  if (!allowed.includes(record.deviceType)) {
    return "Event type does not match the registered device type";
  }

  const timestamp = readIsoTime(record.timestamp, "timestamp");
  if (typeof timestamp !== "string") {
    return timestamp;
  }
  const gatewayReceiveTime = readIsoTime(record.gatewayReceiveTime ?? record.timestamp, "gatewayReceiveTime");
  if (typeof gatewayReceiveTime !== "string") {
    return gatewayReceiveTime;
  }

  const deviceMs = Date.parse(timestamp);
  const maxAgeMs = options?.maxAgeMs ?? MAX_EVENT_AGE_MS;
  if (deviceMs < nowMs - maxAgeMs) {
    return "Event timestamp is too old";
  }
  if (deviceMs > nowMs + MAX_FUTURE_SKEW_MS) {
    return "Event timestamp is in the future";
  }

  if (typeof record.payload !== "object" || record.payload === null || Array.isArray(record.payload)) {
    return "Event payload is required";
  }
  const secretError = rejectSecretFields(record.payload);
  if (secretError) {
    return secretError;
  }

  const claimedOrganizationId = record.organizationId;
  const claimedSiteId = record.siteId;
  if (claimedOrganizationId !== undefined && typeof claimedOrganizationId !== "string") {
    return "organizationId must be a string when provided";
  }
  if (claimedSiteId !== undefined && typeof claimedSiteId !== "string") {
    return "siteId must be a string when provided";
  }

  return {
    eventId,
    gatewayId,
    deviceId,
    deviceType: record.deviceType,
    eventType: record.eventType,
    timestamp,
    gatewayReceiveTime,
    sequence: typeof record.sequence === "string" && record.sequence !== "" ? record.sequence : null,
    softwareVersion:
      typeof record.softwareVersion === "string" && record.softwareVersion !== "" ? record.softwareVersion : null,
    payload: record.payload as Record<string, unknown>,
  };
}

export function organizationClaimMismatch(
  claimed: unknown,
  registeredOrganizationId: string,
): string | null {
  if (claimed === undefined || claimed === null || claimed === "") {
    return null;
  }
  if (claimed !== registeredOrganizationId) {
    return "Event organization does not match the registered gateway";
  }
  return null;
}

export function siteClaimMismatch(claimed: unknown, registeredSiteId: string): string | null {
  if (claimed === undefined || claimed === null || claimed === "") {
    return null;
  }
  if (claimed !== registeredSiteId) {
    return "Event site does not match the registered gateway";
  }
  return null;
}

function readId(value: unknown, field: string): string | string {
  if (typeof value !== "string" || !EVENT_ID_PATTERN.test(value)) {
    return `A valid ${field} is required`;
  }
  return value;
}

function readNonEmpty(value: unknown, field: string): string | string {
  if (typeof value !== "string" || value.trim() === "") {
    return `A valid ${field} is required`;
  }
  return value.trim();
}

function readIsoTime(value: unknown, field: string): string | string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return `A valid ${field} is required`;
  }
  return value;
}
