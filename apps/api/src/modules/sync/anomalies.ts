import {
  NotificationSeverity,
  SecurityCategory,
  SecurityEventSource,
  SecurityEventStatus,
  WeightAnomalyStatus,
  WeighbridgePlatformState,
  WeightAnomalyType,
} from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { emitWeightAnomalyAlert } from "../anomalies/alerts.js";
import type { AuthenticatedGateway } from "../edge/types.js";

export async function ingestLocalWeightAnomaly(
  gateway: AuthenticatedGateway,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<{ eventId: string; created: boolean }> {
  const existing = await prisma.weightAnomalyEvent.findUnique({ where: { sourceEventId: eventId } });
  if (existing) {
    return { eventId: existing.id, created: false };
  }

  const weighbridgeId =
    typeof payload.weighbridgeId === "string"
      ? payload.weighbridgeId
      : (await prisma.weighbridge.findFirst({
          where: { organizationId: gateway.organizationId, siteId: gateway.siteId, isActive: true },
          select: { id: true },
        }))?.id;
  if (!weighbridgeId) {
    throw new HttpError(409, "No weighbridge is available for the local anomaly");
  }
  const type = asAnomalyType(payload.type);
  const now = new Date();
  const observed = typeof payload.observedWeightKg === "number" ? payload.observedWeightKg : null;
  const weighbridge = await prisma.weighbridge.findFirstOrThrow({
    where: { id: weighbridgeId, organizationId: gateway.organizationId },
    select: { code: true },
  });

  const security = await prisma.securityEvent.create({
    data: {
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      weighbridgeId,
      severity: "ANOMALY",
      category: SecurityCategory.WEIGHT_ANOMALY,
      title: typeof payload.title === "string" ? payload.title : type,
      description: typeof payload.explanation === "string" ? payload.explanation : "Local weight anomaly",
      source: SecurityEventSource.RULE_ENGINE,
      correlationKey: `edge-local:${eventId}`,
      status: SecurityEventStatus.OPEN,
      occurredAt: now,
    },
  });

  const event = await prisma.weightAnomalyEvent.create({
    data: {
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      weighbridgeId,
      securityEventId: security.id,
      sourceEventId: eventId,
      type,
      status: WeightAnomalyStatus.OPEN,
      severity: NotificationSeverity.WARNING,
      detectorKind: "RULE",
      ruleId: typeof payload.ruleId === "string" ? payload.ruleId : `local.${type}`,
      ruleVersion: typeof payload.ruleVersion === "string" ? payload.ruleVersion : "1.0.0",
      title: typeof payload.title === "string" ? payload.title : type.replaceAll("_", " "),
      description:
        typeof payload.description === "string" ? payload.description : "Local weight anomaly detected on the Edge Gateway.",
      explanation: typeof payload.explanation === "string" ? payload.explanation : "Local rule evaluation.",
      observedWeightKg: observed,
      previousWeightKg: typeof payload.previousWeightKg === "number" ? payload.previousWeightKg : null,
      platformState: asPlatform(payload.platformState),
      detectionSource: "EDGE_LOCAL",
      firstDetectedAt: now,
      lastDetectedAt: now,
      occurrenceCount: 1,
    },
  });

  await writeAudit({
    organizationId: gateway.organizationId,
    action: AUDIT_ACTIONS.LOCAL_ANOMALY_DETECTED,
    entityType: "WeightAnomalyEvent",
    entityId: event.id,
    metadata: { sourceEventId: eventId, type },
  });

  emitWeightAnomalyAlert({
    organizationId: gateway.organizationId,
    siteId: gateway.siteId,
    weighbridgeId,
    weighbridgeCode: weighbridge.code,
    eventId: event.id,
    observedWeightKg: observed,
    expectedMaxKg: null,
    platformState: event.platformState,
    explanation: event.explanation,
    transactionId: null,
  });

  return { eventId: event.id, created: true };
}

function asAnomalyType(value: unknown): WeightAnomalyType {
  if (typeof value === "string" && (Object.values(WeightAnomalyType) as string[]).includes(value)) {
    return value as WeightAnomalyType;
  }
  return WeightAnomalyType.EMPTY_PLATFORM_WEIGHT;
}

function asPlatform(value: unknown): WeighbridgePlatformState {
  if (typeof value === "string" && (Object.values(WeighbridgePlatformState) as string[]).includes(value)) {
    return value as WeighbridgePlatformState;
  }
  return WeighbridgePlatformState.UNKNOWN;
}
