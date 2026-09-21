import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import {
  organizationClaimMismatch,
  parseEdgeEventEnvelope,
  siteClaimMismatch,
  type EdgeEventEnvelope,
} from "../../domain/edgeEnvelope.js";
import { expectedDeviceTypeForEvent } from "../../domain/edgeTypes.js";
import { correlateHardwareEvent } from "../../domain/hardwareCorrelation.js";
import { resolveEventTimestamp } from "../../domain/hardwareClock.js";
import { canSubmitHardwareSource } from "../../domain/protocolReadiness.js";
import { officialWeighmentRejection } from "../../domain/weighmentAcceptance.js";
import { kgToMilligrams } from "../../domain/netWeight.js";
import { emptyReading, readingFromMilliKg } from "../../domain/normalizedWeight.js";
import { isWeightUnit } from "../../domain/weightUnits.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { ingestNormalizedReading } from "../anomalies/ingest.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { ingestAnprFromEdge } from "../cameras/service.js";
import { uploadDocument } from "../documents/service.js";
import type { ActorContext } from "../shared/actor.js";
import { recordWeighment } from "../transactions/lifecycle.js";
import { emitEdgeDeviceUnhealthy } from "./alerts.js";
import { toPublicIngestResult } from "./mapper.js";
import { parseAnprPayload, parseScanPayload, parseStatusPayload, parseWeightPayload } from "./payloads.js";
import type { AuthenticatedGateway, PublicEdgeIngestResult } from "./types.js";
import { ingestLocalWeightAnomaly } from "../sync/anomalies.js";
import { loadSyncedFile } from "../sync/files.js";
import { resolveCentralTransactionId, upsertLocalTransaction, applyLocalTransactionState } from "../sync/localTransactions.js";

export async function ingestGatewayEvent(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  body: unknown,
  claimed: { organizationId?: unknown; siteId?: unknown },
): Promise<PublicEdgeIngestResult> {
  const nowMs = Date.now();
  const parsed = parseEdgeEventEnvelope(body, nowMs);
  if (typeof parsed === "string") {
    throw new HttpError(400, parsed);
  }
  if (parsed.gatewayId !== gateway.id) {
    throw new HttpError(403, "Event gateway does not match the authenticated gateway");
  }
  const orgMismatch = organizationClaimMismatch(claimed.organizationId, gateway.organizationId);
  if (orgMismatch) {
    throw new HttpError(403, orgMismatch);
  }
  const siteMismatch = siteClaimMismatch(claimed.siteId, gateway.siteId);
  if (siteMismatch) {
    throw new HttpError(403, siteMismatch);
  }

  const existing = await prisma.edgeIngestedEvent.findUnique({ where: { eventId: parsed.eventId } });
  if (existing) {
    if (existing.gatewayId !== gateway.id) {
      throw new HttpError(409, "Event ID is already used by another gateway");
    }
    if (existing.status === "PROCESSED" || existing.status === "REJECTED") {
      await writeAudit({
        organizationId: gateway.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.EDGE_EVENT_DUPLICATE,
        entityType: "EdgeIngestedEvent",
        entityId: existing.eventId,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      return toPublicIngestResult(existing, true);
    }
  }

  const device = await prisma.edgeDevice.findFirst({
    where: { id: parsed.deviceId, gatewayId: gateway.id, organizationId: gateway.organizationId },
  });
  if (!device) {
    throw new HttpError(403, "Device does not belong to this gateway");
  }
  if (device.siteId !== gateway.siteId) {
    throw new HttpError(403, "Device site does not match the registered gateway");
  }
  if (!device.enabled) {
    throw new HttpError(409, "Device is disabled");
  }
  if (!expectedDeviceTypeForEvent(parsed.eventType).includes(device.deviceType)) {
    throw new HttpError(400, "Event type does not match the registered device type");
  }

  if (!existing) {
    try {
      await prisma.edgeIngestedEvent.create({
        data: {
          eventId: parsed.eventId,
          organizationId: gateway.organizationId,
          siteId: gateway.siteId,
          gatewayId: gateway.id,
          deviceId: device.id,
          eventType: parsed.eventType,
          deviceEventTime: new Date(parsed.timestamp),
          gatewayReceiveTime: new Date(parsed.gatewayReceiveTime),
          backendReceiveTime: new Date(nowMs),
          sequence: parsed.sequence,
          softwareVersion: parsed.softwareVersion,
          payload: parsed.payload as Prisma.InputJsonValue,
          status: "RECEIVED",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.edgeIngestedEvent.findUnique({ where: { eventId: parsed.eventId } });
        if (raced && (raced.status === "PROCESSED" || raced.status === "REJECTED")) {
          return toPublicIngestResult(raced, true);
        }
      } else {
        throw error;
      }
    }
  }

  const processed = await processEnvelope(gateway, actor, device.id, parsed);
  const updated = await prisma.edgeIngestedEvent.update({
    where: { eventId: parsed.eventId },
    data: {
      status: "PROCESSED",
      weighmentId: processed.weighmentId,
      anprDetectionId: processed.anprDetectionId,
      documentId: processed.documentId,
      resultSummary: processed.resultSummary as Prisma.InputJsonValue,
    },
  });

  await prisma.edgeDevice.update({
    where: { id: device.id },
    data: {
      lastCommunicationAt: new Date(nowMs),
      lastError: null,
      status: "CONNECTED",
      ...(processed.lastReadingSummary === undefined
        ? {}
        : { lastReadingSummary: processed.lastReadingSummary as Prisma.InputJsonValue }),
    },
  });
  await prisma.edgeGateway.update({
    where: { id: gateway.id },
    data: { lastCommunicationAt: new Date(nowMs), lastError: null },
  });

  await writeAudit({
    organizationId: gateway.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.EDGE_EVENT_INGESTED,
    entityType: "EdgeIngestedEvent",
    entityId: updated.eventId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      eventType: parsed.eventType,
      deviceId: device.id,
      weighmentId: processed.weighmentId,
      anprDetectionId: processed.anprDetectionId,
      documentId: processed.documentId,
    },
  });

  return toPublicIngestResult(updated, false);
}

async function processEnvelope(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  deviceId: string,
  envelope: EdgeEventEnvelope,
): Promise<{
  weighmentId: string | null;
  anprDetectionId: string | null;
  documentId: string | null;
  resultSummary: Record<string, unknown>;
  lastReadingSummary?: Record<string, unknown>;
}> {
  switch (envelope.eventType) {
    case "DEVICE_WEIGHT_READING":
      return processWeight(actor, deviceId, envelope);
    case "DEVICE_ANPR_DETECTION":
      return processAnpr(actor, deviceId, envelope);
    case "DEVICE_SCAN_COMPLETED":
      return processScan(actor, envelope);
    case "DEVICE_STATUS_CHANGED":
      return processStatus(gateway, deviceId, envelope);
    case "LOCAL_TRANSACTION_CREATED": {
      const created = await upsertLocalTransaction(gateway, actor, envelope.payload);
      return {
        weighmentId: null,
        anprDetectionId: null,
        documentId: null,
        resultSummary: { transactionId: created.transactionId, already: created.already },
      };
    }
    case "LOCAL_TRANSACTION_STATE": {
      const applied = await applyLocalTransactionState(gateway, actor, envelope.payload);
      return {
        weighmentId: null,
        anprDetectionId: null,
        documentId: null,
        resultSummary: { transactionId: applied.transactionId, completionState: applied.completionState },
      };
    }
    case "LOCAL_WEIGHT_ANOMALY": {
      const anomaly = await ingestLocalWeightAnomaly(gateway, envelope.eventId, envelope.payload);
      return {
        weighmentId: null,
        anprDetectionId: null,
        documentId: null,
        resultSummary: { anomalyEventId: anomaly.eventId, created: anomaly.created },
      };
    }
    case "LOCAL_FILE_CAPTURED":
    case "CONNECTIVITY_CHANGED":
      return {
        weighmentId: null,
        anprDetectionId: null,
        documentId: null,
        resultSummary: { accepted: true, eventType: envelope.eventType },
      };
    default: {
      const _exhaustive: never = envelope.eventType;
      return _exhaustive;
    }
  }
}

async function processWeight(
  actor: ActorContext,
  deviceId: string,
  envelope: EdgeEventEnvelope,
) {
  const payload = parseWeightPayload(envelope.payload);
  const clock = resolveEventTimestamp({
    deviceEventTime: envelope.timestamp,
    gatewayReceiveTime: envelope.gatewayReceiveTime,
    nowMs: Date.now(),
  });
  const lastReadingSummary = {
    weightKg: payload.weightKg,
    unit: payload.unit,
    quality: payload.quality,
    connectionStatus: payload.connectionStatus,
    source: payload.source,
    deviceEventTime: envelope.timestamp,
    gatewayReceiveTime: envelope.gatewayReceiveTime,
    backendReceiveTime: new Date().toISOString(),
    clockIssue: clock.clockIssue,
    usedGatewayReceipt: clock.usedGatewayReceipt,
  };

  let weighmentId: string | null = null;
  const already = await prisma.edgeIngestedEvent.findUnique({ where: { eventId: envelope.eventId } });
  if (already?.weighmentId) {
    return {
      weighmentId: already.weighmentId,
      anprDetectionId: null,
      documentId: null,
      resultSummary: { accepted: true, official: true, weighmentId: already.weighmentId },
      lastReadingSummary,
    };
  }

  const device = await prisma.edgeDevice.findUniqueOrThrow({ where: { id: deviceId } });
  const resolvedTransactionId =
    payload.transactionId ??
    (await resolveCentralTransactionId(device.gatewayId, payload.localTransactionId, null));
  if (device.weighbridgeId && !payload.localAnomalyEvaluated) {
    try {
      await ingestNormalizedReading({
        weighbridgeId: device.weighbridgeId,
        organizationId: actor.user.organizationId,
        siteId: device.siteId,
        deviceId: device.id,
        transactionId: resolvedTransactionId,
        reading: normalizedFromEdgePayload(device.weighbridgeId, device.code, payload, envelope.timestamp),
      });
    } catch (error) {
      console.error("Weight anomaly ingest from edge failed", {
        weighbridgeId: device.weighbridgeId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  if (clock.clockIssue) {
    await prisma.edgeDevice.update({
      where: { id: device.id },
      data: { lastClockIssue: clock.clockIssue },
    });
  }

  if (payload.captureOfficial) {
    if (payload.source === "HARDWARE") {
      const blocked = canSubmitHardwareSource(device.protocolReadiness);
      if (blocked) {
        throw new HttpError(409, blocked);
      }
    }
    const transaction = resolvedTransactionId
      ? await prisma.transaction.findFirst({
          where: { id: resolvedTransactionId, organizationId: actor.user.organizationId },
          select: { id: true, siteId: true, weighbridgeId: true, operationMode: true },
        })
      : null;
    const correlation = correlateHardwareEvent({
      transactionId: resolvedTransactionId,
      requireTransaction: true,
      deviceSiteId: device.siteId,
      deviceWeighbridgeId: device.weighbridgeId,
      transaction,
    });
    if (correlation) {
      throw new HttpError(409, correlation);
    }
    if (device.protocolReadiness === "PROTOCOL_TEST_ONLY" && transaction?.operationMode === "PRODUCTION") {
      throw new HttpError(409, "Protocol-test readings cannot be official weighments on a production site.");
    }
    if (!device.weighbridgeId) {
      throw new HttpError(400, "Weight device is not linked to a weighbridge");
    }
    const expectedUnit = isWeightUnit(payload.unit) ? payload.unit : undefined;
    if (!expectedUnit) {
      throw new HttpError(409, "Weight unit is not recognized");
    }
    const rejected = officialWeighmentRejection({
      connectionStatus: payload.connectionStatus,
      quality: payload.quality,
      weightKg: payload.weightKg,
      unit: payload.unit,
      expectedUnit,
      limits: { minKg: env.weighmentMinKg, maxKg: env.weighmentMaxKg },
    });
    if (rejected) {
      throw new HttpError(409, rejected);
    }
    if (payload.weightKg === null) {
      throw new HttpError(409, "Stable weight reading is not available.");
    }
    if (!resolvedTransactionId) {
      throw new HttpError(409, "Local transaction has not been synchronized yet");
    }
    const recorded = await recordWeighment(actor, resolvedTransactionId, {
      weightKg: payload.weightKg,
      source: payload.source === "HARDWARE" ? "HARDWARE" : "SIMULATED",
      weighbridgeId: device.weighbridgeId,
      ...(payload.kind === null ? {} : { kind: payload.kind }),
    });
    const latest = recorded.weighments[recorded.weighments.length - 1];
    weighmentId = latest?.id ?? null;
  }

  return {
    weighmentId,
    anprDetectionId: null,
    documentId: null,
    resultSummary: {
      accepted: true,
      official: payload.captureOfficial,
      weighmentId,
      clockIssue: clock.clockIssue,
    },
    lastReadingSummary,
  };
}

async function processAnpr(actor: ActorContext, deviceId: string, envelope: EdgeEventEnvelope) {
  const device = await prisma.edgeDevice.findUniqueOrThrow({ where: { id: deviceId } });
  if (!device.cameraId) {
    throw new HttpError(400, "Camera device is not linked to a camera");
  }
  const payload = parseAnprPayload(envelope.payload);
  const evidence =
    payload.evidenceBase64 && payload.evidenceMimeType
      ? {
          bytes: Buffer.from(payload.evidenceBase64, "base64"),
          mimeType: payload.evidenceMimeType.startsWith("image/") ? payload.evidenceMimeType : "image/png",
        }
      : undefined;

  const identification = await ingestAnprFromEdge(actor, device.cameraId, {
    detectionId: envelope.eventId,
    plateNumber: payload.plateNumber,
    normalizedPlateNumber: payload.normalizedPlateNumber,
    displayPlateNumber: payload.displayPlateNumber,
    confidence: payload.confidence,
    candidates: payload.candidates,
    countryRegion: payload.countryRegion,
    boundingBox: payload.boundingBox,
    processingDurationMs: payload.processingDurationMs,
    capturedAt: new Date(envelope.timestamp),
    simulated: payload.simulated,
    provider: payload.provider,
    ...(evidence === undefined ? {} : { evidence }),
  });

  return {
    weighmentId: null,
    anprDetectionId: identification.detection.id,
    documentId: null,
    resultSummary: {
      detectionId: identification.detection.id,
      lifecycle: identification.detection.lifecycle,
      decision: identification.decision.action,
    },
    lastReadingSummary: {
      plate: identification.detection.displayPlate,
      confidence: identification.detection.confidence,
      lifecycle: identification.detection.lifecycle,
      deviceEventTime: envelope.timestamp,
    },
  };
}

async function processScan(actor: ActorContext, envelope: EdgeEventEnvelope) {
  const payload = parseScanPayload(envelope.payload);
  const resolvedTransactionId = await resolveCentralTransactionId(
    envelope.gatewayId,
    payload.localTransactionId,
    payload.transactionId,
  );
  if (!resolvedTransactionId) {
    return {
      weighmentId: null,
      anprDetectionId: null,
      documentId: null,
      resultSummary: { queuedWithoutTransaction: true, fileName: payload.fileName },
      lastReadingSummary: { fileName: payload.fileName, deviceEventTime: envelope.timestamp },
    };
  }
  const device = await prisma.edgeDevice.findUniqueOrThrow({ where: { id: envelope.deviceId } });
  const transaction = await prisma.transaction.findFirst({
    where: { id: resolvedTransactionId, organizationId: actor.user.organizationId },
    select: { id: true, siteId: true, weighbridgeId: true },
  });
  const correlation = correlateHardwareEvent({
    transactionId: resolvedTransactionId,
    requireTransaction: true,
    deviceSiteId: device.siteId,
    deviceWeighbridgeId: device.weighbridgeId,
    transaction,
  });
  if (correlation) {
    throw new HttpError(409, correlation);
  }

  const storedFile = payload.contentBase64
    ? { buffer: Buffer.from(payload.contentBase64, "base64"), mimeType: payload.mimeType }
    : await loadSyncedFile(envelope.gatewayId, payload.fileId, payload.contentHash).then((file) =>
        file ? { buffer: file.bytes, mimeType: file.mimeType } : null,
      );
  if (!storedFile) {
    throw new HttpError(409, "Local transaction has not been synchronized yet");
  }
  const document = await uploadDocument(actor, resolvedTransactionId, {
    documentType: payload.documentType ?? env.documentTypes[0],
    file: {
      fieldName: "file",
      originalFileName: payload.fileName,
      mimeType: storedFile.mimeType,
      buffer: storedFile.buffer,
    },
  });

  return {
    weighmentId: null,
    anprDetectionId: null,
    documentId: document.id,
    resultSummary: { documentId: document.id, fileName: payload.fileName },
    lastReadingSummary: { fileName: payload.fileName, documentId: document.id },
  };
}

async function processStatus(
  gateway: AuthenticatedGateway,
  deviceId: string,
  envelope: EdgeEventEnvelope,
) {
  const payload = parseStatusPayload(envelope.payload);
  const existing = await prisma.edgeDevice.findUniqueOrThrow({ where: { id: deviceId } });
  await prisma.edgeDevice.update({
    where: { id: deviceId },
    data: {
      status: existing.enabled ? payload.status : "DISABLED",
      lastError: payload.lastError,
      lastCommunicationAt: new Date(),
      ...(payload.summary === null ? {} : { lastReadingSummary: payload.summary as Prisma.InputJsonValue }),
    },
  });
  if (
    existing.status === "CONNECTED" &&
    (payload.status === "DISCONNECTED" || payload.status === "ERROR")
  ) {
    emitEdgeDeviceUnhealthy({
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      deviceId,
      deviceName: existing.name,
      status: payload.status,
      lastError: payload.lastError,
      incidentKey: new Date().toISOString().slice(0, 13),
    });
  }
  return {
    weighmentId: null,
    anprDetectionId: null,
    documentId: null,
    resultSummary: { status: payload.status },
    lastReadingSummary: payload.summary ?? { status: payload.status },
  };
}

function normalizedFromEdgePayload(
  weighbridgeId: string,
  deviceIdentifier: string,
  payload: ReturnType<typeof parseWeightPayload>,
  timestamp: string,
) {
  const unit = isWeightUnit(payload.unit) ? payload.unit : "KG";
  const source = payload.source === "HARDWARE" ? ("HARDWARE" as const) : ("SIMULATOR" as const);
  if (
    payload.weightKg === null ||
    payload.quality === "INVALID" ||
    payload.quality === "NO_DATA" ||
    payload.quality === "DEVICE_ERROR"
  ) {
    return emptyReading({
      weighbridgeId,
      deviceIdentifier,
      providerType: payload.source === "HARDWARE" ? "GENERIC_TCP" : "SIMULATOR",
      source,
      quality: payload.quality,
      connectionStatus: payload.connectionStatus,
      unit,
      statusDetail: payload.quality === "INVALID" ? "Edge reported an invalid weight reading" : null,
    });
  }
  try {
    return readingFromMilliKg({
      milliKg: kgToMilligrams(payload.weightKg),
      unit,
      quality: payload.quality,
      timestamp: new Date(timestamp),
      providerType: payload.source === "HARDWARE" ? "GENERIC_TCP" : "SIMULATOR",
      source,
      deviceIdentifier,
      weighbridgeId,
      connectionStatus: payload.connectionStatus,
    });
  } catch {
    return emptyReading({
      weighbridgeId,
      deviceIdentifier,
      providerType: "SIMULATOR",
      source,
      quality: "INVALID",
      connectionStatus: payload.connectionStatus,
      unit,
      statusDetail: "Edge weight value could not be parsed",
    });
  }
}
