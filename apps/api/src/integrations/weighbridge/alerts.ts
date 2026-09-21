import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import type { ActorContext } from "../../modules/shared/actor.js";
import { safeEmitOperationalEvent } from "../../modules/notifications/emit.js";
import type { HardwareStatusTransition } from "./connectionManager.js";

export function hardwareSystemActor(organizationId: string): ActorContext {
  return {
    user: {
      id: "system:hardware",
      fullName: "Hardware runtime",
      email: "hardware@system.local",
      isActive: true,
      organization: { id: organizationId, name: "System", slug: "system" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: [],
      organizationId,
      sessionId: "system:hardware",
    },
  };
}

export function emitHardwareTransition(event: HardwareStatusTransition, actor?: ActorContext): void {
  const resolvedActor = actor ?? hardwareSystemActor(event.organizationId);
  if ((event.to === "DISCONNECTED" || event.to === "ERROR" || event.to === "DISABLED") && event.from === "CONNECTED") {
    void safeEmitOperationalEvent({
      actor: resolvedActor,
      type: "SYSTEM_ALERT",
      organizationId: event.organizationId,
      siteId: event.siteId,
      title: event.to === "ERROR" ? "Weighbridge connection failed" : "Weighbridge device disconnected",
      message: `${event.deviceName} is ${event.to.toLowerCase()}${event.lastError ? `: ${event.lastError}` : "."}`,
      eventKey: EVENT_KEYS.hardwareDisconnected(event.weighbridgeId, event.incidentKey),
      entityType: "Weighbridge",
      entityId: event.weighbridgeId,
    });
  }
}

export function emitHardwareConnectionFailed(input: {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  deviceName: string;
  incidentKey: string;
  message: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? hardwareSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Weighbridge connection failed",
    message: `${input.deviceName}: ${input.message}`,
    eventKey: EVENT_KEYS.hardwareConnectionFailed(input.weighbridgeId, input.incidentKey),
    entityType: "Weighbridge",
    entityId: input.weighbridgeId,
  });
}

export function emitHardwareRecovered(input: {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  deviceName: string;
  incidentKey: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? hardwareSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Weighbridge device recovered",
    message: `${input.deviceName} is connected again.`,
    eventKey: EVENT_KEYS.hardwareRecovered(input.weighbridgeId, input.incidentKey),
    entityType: "Weighbridge",
    entityId: input.weighbridgeId,
  });
}

export function emitHardwareNoData(input: {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  deviceName: string;
  incidentKey: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? hardwareSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Weighbridge has no data",
    message: `${input.deviceName} has not provided a weight reading within the health timeout.`,
    eventKey: EVENT_KEYS.hardwareNoData(input.weighbridgeId, input.incidentKey),
    entityType: "Weighbridge",
    entityId: input.weighbridgeId,
  });
}

export function emitInvalidWeight(input: {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  deviceName: string;
  incidentKey: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? hardwareSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Invalid weighbridge reading",
    message: `${input.deviceName} returned an invalid weight reading.`,
    eventKey: EVENT_KEYS.hardwareInvalid(input.weighbridgeId, input.incidentKey),
    entityType: "Weighbridge",
    entityId: input.weighbridgeId,
  });
}
