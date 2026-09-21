import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import type { ActorContext } from "../../modules/shared/actor.js";
import { safeEmitOperationalEvent } from "../../modules/notifications/emit.js";
import type { CameraStatusTransition } from "./connectionManager.js";

export function cameraSystemActor(organizationId: string): ActorContext {
  return {
    user: {
      id: "system:camera",
      fullName: "Camera runtime",
      email: "camera@system.local",
      isActive: true,
      organization: { id: organizationId, name: "System", slug: "system" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: [],
      organizationId,
      sessionId: "system:camera",
    },
  };
}

export function emitCameraTransition(event: CameraStatusTransition, actor?: ActorContext): void {
  const resolvedActor = actor ?? cameraSystemActor(event.organizationId);
  if ((event.to === "DISCONNECTED" || event.to === "ERROR" || event.to === "DISABLED") && event.from === "CONNECTED") {
    void safeEmitOperationalEvent({
      actor: resolvedActor,
      type: "SYSTEM_ALERT",
      organizationId: event.organizationId,
      siteId: event.siteId,
      title: event.to === "ERROR" ? "Camera connection failed" : "Camera disconnected",
      message: `${event.deviceName} is ${event.to.toLowerCase()}${event.lastError ? `: ${event.lastError}` : "."}`,
      eventKey: EVENT_KEYS.cameraDisconnected(event.cameraId, event.incidentKey),
      entityType: "Camera",
      entityId: event.cameraId,
    });
  }
}

export function emitAnprUnavailable(input: {
  organizationId: string;
  siteId: string;
  cameraId: string;
  deviceName: string;
  incidentKey: string;
  message: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? cameraSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "ANPR provider unavailable",
    message: `${input.deviceName}: ${input.message}`,
    eventKey: EVENT_KEYS.anprUnavailable(input.cameraId, input.incidentKey),
    entityType: "Camera",
    entityId: input.cameraId,
  });
}

export function emitRepeatedAnprFailure(input: {
  organizationId: string;
  siteId: string;
  cameraId: string;
  deviceName: string;
  windowKey: string;
  actor?: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor ?? cameraSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Repeated ANPR failure",
    message: `${input.deviceName} failed to detect a plate several times. Manual identification is required.`,
    eventKey: EVENT_KEYS.anprRepeatedFailure(input.cameraId, input.windowKey),
    entityType: "Camera",
    entityId: input.cameraId,
  });
}

export function emitVehicleUnregistered(input: {
  organizationId: string;
  siteId: string;
  cameraId: string;
  detectionId: string;
  plate: string;
  actor: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor,
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Vehicle not registered",
    message: `Detected ${input.plate} is not in the vehicle register.`,
    eventKey: EVENT_KEYS.vehicleUnregistered(input.cameraId, input.plate),
    entityType: "AnprDetection",
    entityId: input.detectionId,
  });
}

export function emitManualIdentificationRequired(input: {
  organizationId: string;
  siteId: string;
  cameraId: string;
  detectionId: string;
  deviceName: string;
  windowKey: string;
  actor: ActorContext;
}): void {
  void safeEmitOperationalEvent({
    actor: input.actor,
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Manual identification required",
    message: `${input.deviceName} could not identify the vehicle. Enter the number manually.`,
    eventKey: EVENT_KEYS.manualIdentificationRequired(input.cameraId, input.windowKey),
    entityType: "AnprDetection",
    entityId: input.detectionId,
  });
}
