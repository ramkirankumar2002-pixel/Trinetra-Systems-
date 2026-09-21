import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import { formatKgValue } from "../../domain/weightAnomaly/severity.js";
import type { ActorContext } from "../shared/actor.js";
import { safeEmitOperationalEvent } from "../notifications/emit.js";

export function anomalySystemActor(organizationId: string): ActorContext {
  return {
    user: {
      id: "system:weight-anomaly",
      fullName: "Weight anomaly engine",
      email: "anomaly@system.local",
      isActive: true,
      organization: { id: organizationId, name: "System", slug: "system" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: [],
      organizationId,
      sessionId: "system:weight-anomaly",
    },
  };
}

export function emitWeightAnomalyAlert(input: {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  eventId: string;
  observedWeightKg: number | null;
  expectedMaxKg: number | null;
  platformState: string;
  explanation: string;
  transactionId?: string | null;
  actor?: ActorContext;
}): void {
  const expected =
    input.expectedMaxKg === null ? "configured operating range" : `Near zero (≤ ${formatKgValue(input.expectedMaxKg)})`;
  void safeEmitOperationalEvent({
    actor: input.actor ?? anomalySystemActor(input.organizationId),
    type: "WEIGHT_ANOMALY",
    organizationId: input.organizationId,
    siteId: input.siteId,
    title: "Weight Anomaly Detected",
    message: `Weighbridge ${input.weighbridgeCode}: observed ${formatKgValue(input.observedWeightKg)}. Expected: ${expected}. Platform: ${input.platformState}. Status: OPEN. ${input.explanation}`,
    eventKey: EVENT_KEYS.weightAnomaly(input.eventId),
    entityType: "WeightAnomalyEvent",
    entityId: input.eventId,
    ...(input.transactionId ? { transactionId: input.transactionId } : {}),
  });
}
