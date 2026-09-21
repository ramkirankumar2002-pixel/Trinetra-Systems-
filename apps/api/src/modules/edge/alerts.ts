import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";
import { edgeSystemActor } from "./actor.js";

export function emitGatewayOffline(input: {
  organizationId: string;
  siteId: string;
  gatewayId: string;
  gatewayCode: string;
  incidentKey: string;
}): void {
  void safeEmitOperationalEvent({
    actor: edgeSystemActor(input.organizationId),
    type: "GATEWAY_OFFLINE",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Edge Gateway offline",
    message: `${input.gatewayCode} has stopped sending heartbeats.`,
    eventKey: EVENT_KEYS.gatewayOffline(input.gatewayId, input.incidentKey),
    entityType: "EdgeGateway",
    entityId: input.gatewayId,
  });
}

export function emitEdgeDeviceUnhealthy(input: {
  organizationId: string;
  siteId: string;
  gatewayId: string;
  deviceId: string;
  deviceName: string;
  status: string;
  lastError: string | null;
  incidentKey: string;
}): void {
  void safeEmitOperationalEvent({
    actor: edgeSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Edge device health changed",
    message: `${input.deviceName} is ${input.status.toLowerCase()}${input.lastError ? `: ${input.lastError}` : "."}`,
    eventKey: EVENT_KEYS.edgeDeviceUnhealthy(input.deviceId, input.incidentKey),
    entityType: "EdgeDevice",
    entityId: input.deviceId,
  });
}
