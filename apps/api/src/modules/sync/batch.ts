import { EdgeEventPriority, EdgeSyncAckStatus, TransactionStatus } from "@prisma/client";
import { MAX_SYNC_EVENT_AGE_MS, parseEdgeEventEnvelope } from "../../domain/edgeEnvelope.js";
import { assessSyncConflict } from "../../domain/syncConflict.js";
import { isSuccessfulAck } from "../../domain/edgeQueue.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { ingestGatewayEvent } from "../edge/ingest.js";
import type { AuthenticatedGateway } from "../edge/types.js";
import type { ActorContext } from "../shared/actor.js";
import { emitDeadLetterAlert, emitSyncConflictAlert } from "./alerts.js";
import { ingestLocalWeightAnomaly } from "./anomalies.js";
import { applyLocalTransactionState, upsertLocalTransaction } from "./localTransactions.js";
import { persistSyncSnapshot, recordDeadLetter } from "./snapshot.js";
import type { PublicSyncAck } from "./types.js";
import type { SyncBatchEventInput, SyncSnapshotInput } from "./validators.js";

export async function ingestSyncBatch(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  events: SyncBatchEventInput[],
  snapshot: SyncSnapshotInput | null,
): Promise<{ results: PublicSyncAck[] }> {
  if (snapshot) {
    await persistSyncSnapshot(gateway, snapshot);
  }

  const results: PublicSyncAck[] = [];
  const accepted = new Set<string>();

  for (const item of events) {
    const parsed = parseEdgeEventEnvelope(item.envelope, Date.now(), { maxAgeMs: MAX_SYNC_EVENT_AGE_MS });
    if (typeof parsed === "string") {
      results.push(rejected(unknownEventId(item.envelope), parsed));
      continue;
    }

    const dependsOn = item.dependsOn;
    const missing: string[] = [];
    for (const id of dependsOn) {
      if (accepted.has(id) || (await alreadyProcessed(id, gateway.id))) {
        continue;
      }
      missing.push(id);
    }
    if (missing.length > 0) {
      results.push({
        eventId: parsed.eventId,
        status: EdgeSyncAckStatus.DEPENDENCY_PENDING,
        message: `Waiting for prerequisite events: ${missing.join(", ")}`,
        conflictId: null,
        weighmentId: null,
        transactionId: null,
        alreadyProcessed: false,
      });
      continue;
    }

    try {
      const existing = await prisma.edgeIngestedEvent.findUnique({ where: { eventId: parsed.eventId } });
      if (existing && (existing.status === "PROCESSED" || existing.status === "REJECTED")) {
        results.push({
          eventId: parsed.eventId,
          status: EdgeSyncAckStatus.ALREADY_PROCESSED,
          message: "Event was already processed",
          conflictId: null,
          weighmentId: existing.weighmentId,
          transactionId: null,
          alreadyProcessed: true,
        });
        accepted.add(parsed.eventId);
        continue;
      }

      const conflict = await detectConflict(
        gateway,
        parsed.eventId,
        parsed.eventType,
        parsed.payload,
        item.localTransactionId ?? (typeof parsed.payload.localTransactionId === "string" ? parsed.payload.localTransactionId : null),
      );
      if (conflict) {
        results.push(conflict);
        continue;
      }

      const specialized = await processSpecialEvent(gateway, actor, parsed.eventId, parsed.eventType, parsed.payload);
      if (specialized) {
        await writeAudit({
          organizationId: gateway.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.EDGE_EVENT_SYNCED,
          entityType: "EdgeIngestedEvent",
          entityId: parsed.eventId,
          metadata: { eventType: parsed.eventType, ack: specialized.status },
        });
        results.push(specialized);
        if (isSuccessfulAck(specialized.status)) {
          accepted.add(parsed.eventId);
        }
        continue;
      }

      const ingested = await ingestGatewayEvent(gateway, actor, parsed, {
        organizationId: gateway.organizationId,
        siteId: gateway.siteId,
      });
      await prisma.edgeIngestedEvent.update({
        where: { eventId: parsed.eventId },
        data: {
          priority: toPriority(item.priority),
          localTransactionId: item.localTransactionId,
          payloadHash: item.payloadHash,
          ackStatus: ingested.alreadyProcessed ? EdgeSyncAckStatus.ALREADY_PROCESSED : EdgeSyncAckStatus.ACCEPTED,
        },
      });
      results.push({
        eventId: parsed.eventId,
        status: ingested.alreadyProcessed ? EdgeSyncAckStatus.ALREADY_PROCESSED : EdgeSyncAckStatus.ACCEPTED,
        message: null,
        conflictId: null,
        weighmentId: ingested.weighmentId,
        transactionId: null,
        alreadyProcessed: ingested.alreadyProcessed,
      });
      accepted.add(parsed.eventId);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : error instanceof Error ? error.message : "Sync failed";
      if (error instanceof HttpError && error.status === 409) {
        results.push({
          eventId: parsed.eventId,
          status: EdgeSyncAckStatus.DEPENDENCY_PENDING,
          message: error.message,
          conflictId: null,
          weighmentId: null,
          transactionId: null,
          alreadyProcessed: false,
        });
        continue;
      }
      const permanent = error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 409;
      if (permanent) {
        await recordDeadLetter(gateway, {
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          error: message,
          retryCount: 8,
          payload: { eventType: parsed.eventType },
        });
        emitDeadLetterAlert({
          organizationId: gateway.organizationId,
          siteId: gateway.siteId,
          eventId: parsed.eventId,
          gatewayCode: gateway.code,
          error: message,
        });
      }
      results.push({
        eventId: parsed.eventId,
        status: permanent ? EdgeSyncAckStatus.REJECTED : EdgeSyncAckStatus.REJECTED,
        message,
        conflictId: null,
        weighmentId: null,
        transactionId: null,
        alreadyProcessed: false,
      });
    }
  }

  return { results };
}

async function processSpecialEvent(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<PublicSyncAck | null> {
  switch (eventType) {
    case "LOCAL_TRANSACTION_CREATED": {
      const created = await upsertLocalTransaction(gateway, actor, payload);
      await rememberEvent(gateway, eventId, eventType, payload, created.transactionId);
      return {
        eventId,
        status: created.already ? EdgeSyncAckStatus.ALREADY_PROCESSED : EdgeSyncAckStatus.ACCEPTED,
        message: null,
        conflictId: null,
        weighmentId: null,
        transactionId: created.transactionId,
        alreadyProcessed: created.already,
      };
    }
    case "LOCAL_TRANSACTION_STATE": {
      const applied = await applyLocalTransactionState(gateway, actor, payload);
      await rememberEvent(gateway, eventId, eventType, payload, applied.transactionId);
      return {
        eventId,
        status: EdgeSyncAckStatus.ACCEPTED,
        message: null,
        conflictId: null,
        weighmentId: null,
        transactionId: applied.transactionId,
        alreadyProcessed: false,
      };
    }
    case "LOCAL_WEIGHT_ANOMALY": {
      const anomaly = await ingestLocalWeightAnomaly(gateway, eventId, payload);
      await rememberEvent(gateway, eventId, eventType, payload, null);
      return {
        eventId,
        status: anomaly.created ? EdgeSyncAckStatus.ACCEPTED : EdgeSyncAckStatus.ALREADY_PROCESSED,
        message: null,
        conflictId: null,
        weighmentId: null,
        transactionId: null,
        alreadyProcessed: !anomaly.created,
      };
    }
    case "LOCAL_FILE_CAPTURED":
    case "CONNECTIVITY_CHANGED":
      await rememberEvent(gateway, eventId, eventType, payload, null);
      return {
        eventId,
        status: EdgeSyncAckStatus.ACCEPTED,
        message: null,
        conflictId: null,
        weighmentId: null,
        transactionId: null,
        alreadyProcessed: false,
      };
    default:
      return null;
  }
}

async function detectConflict(
  gateway: AuthenticatedGateway,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  localTransactionId: string | null,
): Promise<PublicSyncAck | null> {
  if (eventType !== "LOCAL_TRANSACTION_STATE" || localTransactionId === null) {
    return null;
  }
  const mapped = await prisma.edgeLocalTransactionMap.findUnique({
    where: { gatewayId_localTransactionId: { gatewayId: gateway.id, localTransactionId } },
    include: { transaction: { select: { id: true, status: true } } },
  });
  if (!mapped?.transaction) {
    return null;
  }
  const localState = typeof payload.localState === "string" ? payload.localState : mapped.localState;
  const assessment = assessSyncConflict({
    localState,
    centralStatus: mapped.transaction.status,
  });
  if (!assessment.conflict || !assessment.reason || !assessment.recommendedAction) {
    return null;
  }
  if (
    mapped.transaction.status === TransactionStatus.REJECTED ||
    mapped.transaction.status === TransactionStatus.CANCELLED ||
    mapped.transaction.status === TransactionStatus.EXCEPTION
  ) {
    const conflict = await prisma.edgeSyncConflict.upsert({
      where: {
        gatewayId_eventId: {
          gatewayId: gateway.id,
          eventId,
        },
      },
      update: {
        localState,
        centralState: mapped.transaction.status,
        reason: assessment.reason,
      },
      create: {
        organizationId: gateway.organizationId,
        siteId: gateway.siteId,
        gatewayId: gateway.id,
        eventId,
        localTransactionId,
        transactionId: mapped.transaction.id,
        localState,
        centralState: mapped.transaction.status,
        reason: assessment.reason,
        recommendedAction: assessment.recommendedAction,
      },
    });
    emitSyncConflictAlert({
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      conflictId: conflict.id,
      gatewayCode: gateway.code,
      reason: assessment.reason,
    });
    await writeAudit({
      organizationId: gateway.organizationId,
      action: AUDIT_ACTIONS.EDGE_SYNC_CONFLICT_DETECTED,
      entityType: "EdgeSyncConflict",
      entityId: conflict.id,
      metadata: { localTransactionId, centralState: mapped.transaction.status },
    });
    return {
        eventId,
        status: EdgeSyncAckStatus.CONFLICT,
      message: assessment.reason,
      conflictId: conflict.id,
      weighmentId: null,
      transactionId: mapped.transaction.id,
      alreadyProcessed: false,
    };
  }
  return null;
}

async function alreadyProcessed(eventId: string, gatewayId: string): Promise<boolean> {
  const existing = await prisma.edgeIngestedEvent.findUnique({ where: { eventId } });
  return existing?.gatewayId === gatewayId && (existing.status === "PROCESSED" || existing.status === "REJECTED");
}

async function rememberEvent(
  gateway: AuthenticatedGateway,
  eventId: string,
  eventType: string,
  payload: Record<string, unknown>,
  transactionId: string | null,
): Promise<void> {
  const existing = await prisma.edgeIngestedEvent.findUnique({ where: { eventId } });
  if (existing) {
    return;
  }
  const device = await prisma.edgeDevice.findFirst({
    where: { gatewayId: gateway.id, organizationId: gateway.organizationId },
    orderBy: { code: "asc" },
  });
  if (!device) {
    return;
  }
  await prisma.edgeIngestedEvent.create({
    data: {
      eventId,
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      deviceId: device.id,
      eventType: eventType as never,
      deviceEventTime: new Date(),
      gatewayReceiveTime: new Date(),
      backendReceiveTime: new Date(),
      payload: payload as never,
      status: "PROCESSED",
      ackStatus: EdgeSyncAckStatus.ACCEPTED,
      localTransactionId: typeof payload.localTransactionId === "string" ? payload.localTransactionId : null,
      resultSummary: transactionId ? { transactionId } : { accepted: true },
    },
  });
}

function toPriority(value: string): EdgeEventPriority {
  switch (value) {
    case "CRITICAL":
      return EdgeEventPriority.CRITICAL;
    case "HIGH":
      return EdgeEventPriority.HIGH;
    case "LOW":
      return EdgeEventPriority.LOW;
    default:
      return EdgeEventPriority.NORMAL;
  }
}

function unknownEventId(envelope: unknown): string {
  if (typeof envelope === "object" && envelope !== null && "eventId" in envelope && typeof envelope.eventId === "string") {
    return envelope.eventId;
  }
  return "UNKNOWN-EVENT";
}

function rejected(eventId: string, message: string): PublicSyncAck {
  return {
    eventId,
    status: EdgeSyncAckStatus.REJECTED,
    message,
    conflictId: null,
    weighmentId: null,
    transactionId: null,
    alreadyProcessed: false,
  };
}
