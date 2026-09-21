import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";
import { edgeSystemActor } from "../edge/actor.js";

export function emitSyncConflictAlert(input: {
  organizationId: string;
  siteId: string;
  conflictId: string;
  gatewayCode: string;
  reason: string;
}): void {
  void safeEmitOperationalEvent({
    actor: edgeSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Edge synchronization conflict",
    message: `${input.gatewayCode}: ${input.reason}`,
    eventKey: EVENT_KEYS.syncConflict(input.conflictId),
    entityType: "EdgeSyncConflict",
    entityId: input.conflictId,
  });
}

export function emitDeadLetterAlert(input: {
  organizationId: string;
  siteId: string;
  eventId: string;
  gatewayCode: string;
  error: string;
}): void {
  void safeEmitOperationalEvent({
    actor: edgeSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Edge event moved to dead letter",
    message: `${input.gatewayCode} could not synchronize ${input.eventId}: ${input.error}`,
    eventKey: EVENT_KEYS.syncDeadLetter(input.eventId),
    entityType: "EdgeDeadLetter",
    entityId: input.eventId,
  });
}

export function emitStorageLimitAlert(input: {
  organizationId: string;
  siteId: string;
  gatewayId: string;
  gatewayCode: string;
}): void {
  void safeEmitOperationalEvent({
    actor: edgeSystemActor(input.organizationId),
    type: "SYSTEM_ALERT",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Edge local storage approaching limit",
    message: `${input.gatewayCode} is approaching its local storage limit. Business events were not deleted.`,
    eventKey: EVENT_KEYS.edgeStorageLimit(input.gatewayId),
    entityType: "EdgeGateway",
    entityId: input.gatewayId,
  });
}
