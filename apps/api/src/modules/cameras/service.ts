import {
  AnprDetectionLifecycle,
  AnprProviderStatus,
  CameraConnectionType,
  CameraProviderType,
  CameraPurpose,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { classifyAnprConfidence } from "../../domain/anprConfidence.js";
import { assertAnprLifecycle } from "../../domain/anprLifecycle.js";
import type { AnprCandidate } from "../../domain/anprResult.js";
import type { CameraConfigInput, CameraSimulatorScenario } from "../../domain/cameraConfig.js";
import { isCameraSimulatorScenario, validateCameraConfig } from "../../domain/cameraConfig.js";
import { canConfirmWithoutCorrection, decideIdentification } from "../../domain/identificationDecision.js";
import {
  displayRegistrationNumber,
  normalizeRegistrationNumber,
  validateRegistrationNumber,
} from "../../domain/vehicleNumber.js";
import { prisma } from "../../db/client.js";
import { getAnprProvider } from "../../integrations/anpr/index.js";
import {
  emitAnprUnavailable,
  emitManualIdentificationRequired,
  emitRepeatedAnprFailure,
  emitVehicleUnregistered,
} from "../../integrations/cameras/alerts.js";
import { getCameraConnectionManager } from "../../integrations/cameras/connectionManager.js";
import { toCameraFactoryInput } from "../../integrations/cameras/runtime.js";
import type { CameraFrame } from "../../integrations/cameras/types.js";
import { getAnprEvidenceStorage } from "../../integrations/storage/anprEvidence.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { createArrival, identifyTransaction } from "../transactions/service.js";
import { findVehicleByRegistration } from "../vehicles/service.js";
import { toPublicVehicle, vehicleInclude, type PublicVehicle } from "../vehicles/mapper.js";
import {
  toPublicCamera,
  toPublicDetection,
  type CameraRow,
  type PublicCamera,
  type PublicIdentification,
} from "./mapper.js";

const cameraInclude = {
  weighbridge: { select: { code: true, name: true } },
  site: { select: { id: true, code: true, name: true } },
} as const;

const failureCounts = new Map<string, number>();

export async function listCameras(actor: ActorContext): Promise<{ items: PublicCamera[] }> {
  const rows = await prisma.camera.findMany({
    where: { organizationId: actor.user.organizationId },
    include: cameraInclude,
    orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
  });
  const items = rows
    .filter((row) => canAccessSite(actor.user, row.siteId))
    .map((row) => toPublicCamera(row, getCameraConnectionManager().getSnapshot(row.id)));
  return { items };
}

export async function getCamera(actor: ActorContext, cameraId: string): Promise<PublicCamera> {
  const camera = await loadCamera(actor, cameraId);
  return toPublicCamera(camera, getCameraConnectionManager().getSnapshot(camera.id));
}

export async function createCamera(
  actor: ActorContext,
  input: CameraConfigInput & { weighbridgeId: string },
): Promise<PublicCamera> {
  const weighbridge = await prisma.weighbridge.findFirst({
    where: { id: input.weighbridgeId, organizationId: actor.user.organizationId },
  });
  if (!weighbridge) {
    throw new HttpError(404, "Weighbridge not found");
  }
  if (!canAccessSite(actor.user, weighbridge.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const created = await prisma.camera.create({
    data: {
      organizationId: weighbridge.organizationId,
      siteId: weighbridge.siteId,
      weighbridgeId: weighbridge.id,
      name: input.name,
      cameraIdentifier: input.cameraIdentifier,
      purpose: input.purpose as CameraPurpose,
      cameraProviderType: input.cameraProviderType as CameraProviderType,
      connectionType: input.connectionType as CameraConnectionType,
      anprProviderType: input.anprProviderType,
      enabled: input.enabled,
      direction: input.direction ?? (input.purpose === "ENTRY_ANPR" ? "ENTRY" : null),
      snapshotUrl: input.snapshotUrl ?? null,
      streamUrl: input.streamUrl ?? null,
      highConfidenceMin: input.highConfidenceMin,
      mediumConfidenceMin: input.mediumConfidenceMin,
      simulatorScenario: input.simulatorScenario,
    },
    include: cameraInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.CAMERA_CREATED,
    entityType: "Camera",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      weighbridgeId: created.weighbridgeId,
      purpose: created.purpose,
      provider: created.cameraProviderType,
    },
  });

  if (created.enabled) {
    await getCameraConnectionManager().start(toCameraFactoryInput(created));
  }

  return toPublicCamera(created, getCameraConnectionManager().getSnapshot(created.id));
}

export async function updateCamera(
  actor: ActorContext,
  cameraId: string,
  patch: Partial<CameraConfigInput>,
): Promise<PublicCamera> {
  const camera = await loadCamera(actor, cameraId);
  const merged: CameraConfigInput = {
    name: patch.name ?? camera.name,
    cameraIdentifier: patch.cameraIdentifier ?? camera.cameraIdentifier,
    purpose: patch.purpose ?? camera.purpose,
    cameraProviderType: patch.cameraProviderType ?? camera.cameraProviderType,
    connectionType: patch.connectionType ?? camera.connectionType,
    anprProviderType: patch.anprProviderType ?? camera.anprProviderType,
    enabled: patch.enabled ?? camera.enabled,
    highConfidenceMin: patch.highConfidenceMin ?? Number(camera.highConfidenceMin.toString()),
    mediumConfidenceMin: patch.mediumConfidenceMin ?? Number(camera.mediumConfidenceMin.toString()),
    simulatorScenario: (patch.simulatorScenario ??
      (isCameraSimulatorScenario(camera.simulatorScenario) ? camera.simulatorScenario : "HIGH_KNOWN")) as CameraSimulatorScenario,
    ...(patch.direction !== undefined || camera.direction
      ? { direction: patch.direction ?? camera.direction ?? undefined }
      : {}),
    ...(patch.snapshotUrl !== undefined || camera.snapshotUrl
      ? { snapshotUrl: patch.snapshotUrl ?? camera.snapshotUrl ?? undefined }
      : {}),
    ...(patch.streamUrl !== undefined || camera.streamUrl
      ? { streamUrl: patch.streamUrl ?? camera.streamUrl ?? undefined }
      : {}),
  };
  const error = validateCameraConfig(merged);
  if (error) {
    throw new HttpError(400, error);
  }

  const updated = await prisma.camera.update({
    where: { id: camera.id },
    data: {
      name: merged.name,
      cameraIdentifier: merged.cameraIdentifier,
      purpose: merged.purpose as CameraPurpose,
      cameraProviderType: merged.cameraProviderType as CameraProviderType,
      connectionType: merged.connectionType as CameraConnectionType,
      anprProviderType: merged.anprProviderType,
      enabled: merged.enabled,
      direction: merged.direction ?? null,
      snapshotUrl: merged.snapshotUrl ?? null,
      streamUrl: merged.streamUrl ?? null,
      highConfidenceMin: merged.highConfidenceMin,
      mediumConfidenceMin: merged.mediumConfidenceMin,
      simulatorScenario: merged.simulatorScenario,
    },
    include: cameraInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.CAMERA_UPDATED,
    entityType: "Camera",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { weighbridgeId: updated.weighbridgeId, enabled: updated.enabled },
  });

  if (updated.enabled) {
    await getCameraConnectionManager().start(toCameraFactoryInput(updated));
  } else {
    await getCameraConnectionManager().stop(updated.id, "Camera disabled");
  }

  return toPublicCamera(updated, getCameraConnectionManager().getSnapshot(updated.id));
}

export async function setCameraEnabled(
  actor: ActorContext,
  cameraId: string,
  enabled: boolean,
): Promise<PublicCamera> {
  const camera = await loadCamera(actor, cameraId);
  const updated = await prisma.camera.update({
    where: { id: camera.id },
    data: {
      enabled,
      lastStatus: enabled ? "DISCONNECTED" : "DISABLED",
    },
    include: cameraInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: enabled ? AUDIT_ACTIONS.CAMERA_ENABLED : AUDIT_ACTIONS.CAMERA_DISABLED,
    entityType: "Camera",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { enabled },
  });

  if (enabled) {
    await getCameraConnectionManager().start(toCameraFactoryInput(updated));
  } else {
    await getCameraConnectionManager().stop(updated.id, "Camera disabled");
  }

  return toPublicCamera(updated, getCameraConnectionManager().getSnapshot(updated.id));
}

export async function testCameraConnection(actor: ActorContext, cameraId: string) {
  const camera = await loadCamera(actor, cameraId);
  const result = await getCameraConnectionManager().test(toCameraFactoryInput({ ...camera, enabled: true }));

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: result.ok ? AUDIT_ACTIONS.CAMERA_CONNECTION_TESTED : AUDIT_ACTIONS.CAMERA_CONNECTION_FAILED,
    entityType: "Camera",
    entityId: camera.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { ok: result.ok, message: result.message },
  });

  return {
    ok: result.ok,
    message: result.message,
    camera: toPublicCamera(camera, getCameraConnectionManager().getSnapshot(camera.id) ?? result.snapshot),
  };
}

export async function getCameraStatus(actor: ActorContext, cameraId: string) {
  const camera = await getCamera(actor, cameraId);
  const anpr = getAnprProvider(camera.anprProviderType === "SIMULATOR" ? "SIMULATOR" : "SIMULATOR").getStatus();
  return {
    camera,
    anpr: {
      status: anpr.status,
      provider: anpr.provider,
      simulated: anpr.simulated,
      lastError: anpr.lastError,
    },
  };
}

export async function getAnprProviderStatus(actor: ActorContext, cameraId: string) {
  const camera = await loadCamera(actor, cameraId);
  return getAnprProvider(camera.anprProviderType === "SIMULATOR" ? "SIMULATOR" : "SIMULATOR").getStatus();
}

export async function recognizeCamera(
  actor: ActorContext,
  cameraId: string,
  input: { scenario?: string | undefined },
): Promise<PublicIdentification> {
  const camera = await ensureStarted(actor, cameraId);
  const anpr = getAnprProvider("SIMULATOR");
  await anpr.initialize();
  const anprStatus = anpr.getStatus();
  if (anprStatus.status === "UNAVAILABLE" || anprStatus.status === "ERROR") {
    emitAnprUnavailable({
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      deviceName: camera.name,
      incidentKey: `${camera.id}:unavailable:${hourKey()}`,
      message: anprStatus.lastError ?? "ANPR provider is unavailable",
      actor,
    });
    throw new HttpError(503, "ANPR provider is unavailable");
  }

  let frame: CameraFrame;
  try {
    frame = await getCameraConnectionManager().capture(camera.id);
  } catch (error) {
    throw new HttpError(409, error instanceof Error ? error.message : "Camera did not capture a frame");
  }

  if (input.scenario && isCameraSimulatorScenario(input.scenario)) {
    frame = { ...frame, scenario: input.scenario };
  }

  const detectionId = randomUUID();
  const stored = await getAnprEvidenceStorage().store({
    organizationId: camera.organizationId,
    cameraId: camera.id,
    detectionId,
    fileName: "frame.png",
    mimeType: frame.mimeType,
    bytes: frame.bytes,
  });

  const recognized = await anpr.recognize(frame);
  const thresholds = {
    highMin: Number(camera.highConfidenceMin.toString()),
    mediumMin: Number(camera.mediumConfidenceMin.toString()),
  };
  const confidenceBand = classifyAnprConfidence(recognized.confidence, thresholds);
  const plateDetected = recognized.normalizedPlateNumber !== null && recognized.normalizedPlateNumber !== "";
  const initialLifecycle: AnprDetectionLifecycle = "DETECTED";

  const created = await prisma.anprDetection.create({
    data: {
      id: detectionId,
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      weighbridgeId: camera.weighbridgeId,
      rawPlate: recognized.plateNumber,
      normalizedPlate: recognized.normalizedPlateNumber,
      displayPlate: recognized.displayPlateNumber,
      confidence: recognized.confidence,
      confidenceBand,
      provider: recognized.provider,
      source: "ANPR",
      simulated: recognized.simulated,
      lifecycle: initialLifecycle,
      imageStorageKey: stored.key,
      countryRegion: recognized.countryRegion,
      boundingBox: recognized.boundingBox === null ? Prisma.JsonNull : (recognized.boundingBox as Prisma.InputJsonValue),
      candidates: recognized.candidates as Prisma.InputJsonValue,
      processingDurationMs: recognized.processingDurationMs,
      capturedAt: new Date(recognized.timestamp),
    },
  });

  await prisma.camera.update({
    where: { id: camera.id },
    data: {
      lastAnprStatus: AnprProviderStatus.READY,
      lastFrameStorageKey: stored.key,
      lastFrameAt: created.capturedAt,
      lastCommunicationAt: new Date(),
    },
  });
  camera.lastAnprStatus = AnprProviderStatus.READY;
  camera.lastFrameStorageKey = stored.key;
  camera.lastFrameAt = created.capturedAt;
  camera.lastCommunicationAt = new Date();

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: plateDetected ? AUDIT_ACTIONS.ANPR_DETECTION : AUDIT_ACTIONS.ANPR_FAILURE,
    entityType: "AnprDetection",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      cameraId: camera.id,
      provider: created.provider,
      simulated: created.simulated,
      confidence: created.confidence?.toString() ?? null,
      rawPlate: created.rawPlate,
      normalizedPlate: created.normalizedPlate,
    },
  });

  return finalizeLookup(actor, camera, created, recognized.candidates);
}

export async function ingestAnprFromEdge(
  actor: ActorContext,
  cameraId: string,
  input: {
    detectionId: string;
    plateNumber: string | null;
    normalizedPlateNumber: string | null;
    displayPlateNumber: string | null;
    confidence: number | null;
    candidates: AnprCandidate[];
    countryRegion: string | null;
    boundingBox: unknown;
    processingDurationMs: number;
    capturedAt: Date;
    simulated: boolean;
    provider: string;
    evidence?: { bytes: Buffer; mimeType: string } | undefined;
  },
): Promise<PublicIdentification> {
  const existing = await prisma.anprDetection.findUnique({ where: { id: input.detectionId } });
  if (existing) {
    return getDetection(actor, cameraId, existing.id);
  }

  const camera = await loadCamera(actor, cameraId);
  if (!camera.enabled) {
    throw new HttpError(409, "Camera is disabled");
  }

  let imageStorageKey: string | null = null;
  if (input.evidence && input.evidence.bytes.length > 0) {
    const stored = await getAnprEvidenceStorage().store({
      organizationId: camera.organizationId,
      cameraId: camera.id,
      detectionId: input.detectionId,
      fileName: "edge-frame.png",
      mimeType: input.evidence.mimeType,
      bytes: input.evidence.bytes,
    });
    imageStorageKey = stored.key;
  }

  const thresholds = {
    highMin: Number(camera.highConfidenceMin.toString()),
    mediumMin: Number(camera.mediumConfidenceMin.toString()),
  };
  const confidenceBand = classifyAnprConfidence(input.confidence, thresholds);
  const plateDetected = input.normalizedPlateNumber !== null && input.normalizedPlateNumber !== "";

  const created = await prisma.anprDetection.create({
    data: {
      id: input.detectionId,
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      weighbridgeId: camera.weighbridgeId,
      rawPlate: input.plateNumber,
      normalizedPlate: input.normalizedPlateNumber,
      displayPlate: input.displayPlateNumber,
      confidence: input.confidence,
      confidenceBand,
      provider: input.provider,
      source: "ANPR",
      simulated: input.simulated,
      lifecycle: "DETECTED",
      imageStorageKey,
      countryRegion: input.countryRegion,
      boundingBox: input.boundingBox === null ? Prisma.JsonNull : (input.boundingBox as Prisma.InputJsonValue),
      candidates: input.candidates as Prisma.InputJsonValue,
      processingDurationMs: input.processingDurationMs,
      capturedAt: input.capturedAt,
    },
  });

  await prisma.camera.update({
    where: { id: camera.id },
    data: {
      lastAnprStatus: AnprProviderStatus.READY,
      lastFrameStorageKey: imageStorageKey,
      lastFrameAt: created.capturedAt,
      lastCommunicationAt: new Date(),
    },
  });
  camera.lastAnprStatus = AnprProviderStatus.READY;
  camera.lastFrameStorageKey = imageStorageKey;
  camera.lastFrameAt = created.capturedAt;
  camera.lastCommunicationAt = new Date();

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: plateDetected ? AUDIT_ACTIONS.ANPR_DETECTION : AUDIT_ACTIONS.ANPR_FAILURE,
    entityType: "AnprDetection",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      cameraId: camera.id,
      provider: created.provider,
      simulated: created.simulated,
      source: "EDGE",
      rawPlate: created.rawPlate,
      normalizedPlate: created.normalizedPlate,
    },
  });

  return finalizeLookup(actor, camera, created, input.candidates);
}

export async function getDetection(
  actor: ActorContext,
  cameraId: string,
  detectionId: string,
): Promise<PublicIdentification> {
  const camera = await loadCamera(actor, cameraId);
  const detection = await loadDetection(camera, detectionId);
  const plate = detection.correctedPlate ?? detection.normalizedPlate ?? "";
  const vehicle = plate === "" ? null : await findVehicleByRegistration(actor, plate);
  const candidates = Array.isArray(detection.candidates) ? (detection.candidates as AnprCandidate[]) : [];
  return assembleIdentification(actor, camera, detection, vehicle, candidates);
}

export async function correctDetection(
  actor: ActorContext,
  cameraId: string,
  detectionId: string,
  input: { plate: string; reason?: string | undefined },
): Promise<PublicIdentification> {
  const camera = await loadCamera(actor, cameraId);
  const detection = await loadDetection(camera, detectionId);
  const lifecycleError = assertAnprLifecycle(detection.lifecycle, "CORRECTED");
  if (lifecycleError) {
    throw new HttpError(409, lifecycleError);
  }

  const normalized = normalizeRegistrationNumber(input.plate);
  const invalid = validateRegistrationNumber(normalized);
  if (invalid) {
    throw new HttpError(400, invalid);
  }

  const updated = await prisma.anprDetection.update({
    where: { id: detection.id },
    data: {
      correctedPlate: normalized,
      correctionReason: input.reason ?? null,
      lifecycle: "CORRECTED",
      selectedCandidatePlate: normalized,
    },
  });

  await writeIdentificationEvent(actor, camera, updated, "CORRECTED", updated.vehicleId, input.reason);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ANPR_CORRECTED,
    entityType: "AnprDetection",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      originalPlate: detection.rawPlate,
      originalNormalized: detection.normalizedPlate,
      correctedPlate: normalized,
      reason: input.reason ?? null,
      provider: detection.provider,
      cameraId: camera.id,
    },
  });

  const vehicle = await findVehicleByRegistration(actor, normalized);
  const nextLifecycle: AnprDetectionLifecycle = vehicle ? "MATCHED" : "NO_MATCH";
  const advanced = await prisma.anprDetection.update({
    where: { id: updated.id },
    data: {
      lifecycle: nextLifecycle,
      vehicleId: vehicle?.id ?? null,
    },
  });

  await writeIdentificationEvent(actor, camera, advanced, vehicle ? "MATCHED" : "NO_MATCH", vehicle?.id ?? null);
  if (vehicle) {
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.VEHICLE_MATCHED,
      entityType: "AnprDetection",
      entityId: advanced.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { registrationNumber: vehicle.registrationNumber },
    });
  } else {
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.VEHICLE_NOT_FOUND,
      entityType: "AnprDetection",
      entityId: advanced.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { registrationNumber: normalized },
    });
    emitVehicleUnregistered({
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      detectionId: advanced.id,
      plate: normalized,
      actor,
    });
  }

  return assembleIdentification(actor, camera, advanced, vehicle, asCandidates(advanced.candidates));
}

export async function manualIdentify(
  actor: ActorContext,
  cameraId: string,
  input: { plate: string },
): Promise<PublicIdentification> {
  const camera = await loadCamera(actor, cameraId);
  const normalized = normalizeRegistrationNumber(input.plate);
  const invalid = validateRegistrationNumber(normalized);
  if (invalid) {
    throw new HttpError(400, invalid);
  }

  const created = await prisma.anprDetection.create({
    data: {
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      weighbridgeId: camera.weighbridgeId,
      rawPlate: input.plate.trim(),
      normalizedPlate: normalized,
      displayPlate: displayRegistrationNumber(input.plate),
      confidence: null,
      confidenceBand: "NONE",
      provider: "manual",
      source: "MANUAL",
      simulated: false,
      lifecycle: "DETECTED",
      candidates: [],
      processingDurationMs: 0,
      capturedAt: new Date(),
    },
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.VEHICLE_MANUAL_ENTRY,
    entityType: "AnprDetection",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { registrationNumber: normalized, source: "MANUAL", cameraId: camera.id },
  });

  const vehicle = await findVehicleByRegistration(actor, normalized);
  const lifecycle: AnprDetectionLifecycle = vehicle ? "MATCHED" : "NO_MATCH";
  const updated = await prisma.anprDetection.update({
    where: { id: created.id },
    data: { lifecycle, vehicleId: vehicle?.id ?? null },
  });

  await writeIdentificationEvent(actor, camera, updated, vehicle ? "MATCHED" : "NO_MATCH", vehicle?.id ?? null);
  if (!vehicle) {
    emitVehicleUnregistered({
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      detectionId: updated.id,
      plate: normalized,
      actor,
    });
  }

  return assembleIdentification(actor, camera, updated, vehicle, []);
}

export async function confirmIdentification(
  actor: ActorContext,
  cameraId: string,
  detectionId: string,
  input: { vehicleId: string; transactionId?: string | undefined },
): Promise<PublicIdentification> {
  const camera = await loadCamera(actor, cameraId);
  const detection = await loadDetection(camera, detectionId);
  if (detection.lifecycle === "CONFIRMED") {
    throw new HttpError(409, "This detection is already confirmed");
  }
  if (detection.lifecycle === "REJECTED") {
    throw new HttpError(409, "This detection was rejected");
  }
  if (detection.source === "ANPR" && detection.confidenceBand === "LOW" && !detection.correctedPlate) {
    throw new HttpError(409, "Please verify vehicle number");
  }
  if (detection.source === "ANPR" && detection.confidenceBand === "NONE" && !detection.correctedPlate) {
    throw new HttpError(409, "No plate was detected. Use manual vehicle entry.");
  }
  if (detection.source === "ANPR" && !canConfirmWithoutCorrection(detection.confidenceBand) && !detection.correctedPlate) {
    throw new HttpError(409, "Please verify vehicle number");
  }

  const vehicle = await prisma.vehicle.findFirst({
    where: {
      id: input.vehicleId,
      organizationId: actor.user.organizationId,
      deletedAt: null,
    },
    include: vehicleInclude,
  });
  if (!vehicle) {
    throw new HttpError(400, "Vehicle was not found or is inactive");
  }
  if (!plateMatchesDetection(vehicle.registrationNumber, detection)) {
    throw new HttpError(400, "Selected vehicle does not match the confirmed plate");
  }

  const official = await (input.transactionId
    ? identifyTransaction(actor, input.transactionId, { vehicleId: vehicle.id })
    : createArrival(actor, { weighbridgeId: camera.weighbridgeId, vehicleId: vehicle.id }));

  const updated = await prisma.anprDetection.update({
    where: { id: detection.id },
    data: {
      lifecycle: "CONFIRMED",
      vehicleId: vehicle.id,
      transactionId: official.id,
      confirmedByUserId: actor.user.id,
      confirmedAt: new Date(),
      selectedCandidatePlate: vehicle.registrationNumber,
    },
  });

  await writeIdentificationEvent(
    actor,
    camera,
    updated,
    detection.source === "MANUAL" ? "MANUAL" : "CONFIRMED",
    vehicle.id,
  );
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.VEHICLE_CONFIRMATION,
    entityType: "AnprDetection",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      transactionId: official.id,
      registrationNumber: vehicle.registrationNumber,
      source: detection.source,
    },
  });

  return assembleIdentification(actor, camera, updated, toPublicVehicle(vehicle), asCandidates(updated.candidates));
}

export async function rejectDetection(
  actor: ActorContext,
  cameraId: string,
  detectionId: string,
  input: { reason?: string | undefined },
): Promise<PublicIdentification> {
  const camera = await loadCamera(actor, cameraId);
  const detection = await loadDetection(camera, detectionId);
  const lifecycleError = assertAnprLifecycle(detection.lifecycle, "REJECTED");
  if (lifecycleError) {
    throw new HttpError(409, lifecycleError);
  }

  const updated = await prisma.anprDetection.update({
    where: { id: detection.id },
    data: { lifecycle: "REJECTED", correctionReason: input.reason ?? detection.correctionReason },
  });

  await writeIdentificationEvent(actor, camera, updated, "REJECTED", updated.vehicleId, input.reason);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ANPR_REJECTED,
    entityType: "AnprDetection",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { reason: input.reason ?? null },
  });

  return assembleIdentification(actor, camera, updated, null, asCandidates(updated.candidates));
}

export async function readDetectionFrame(actor: ActorContext, cameraId: string, detectionId: string) {
  const camera = await loadCamera(actor, cameraId);
  const detection = await loadDetection(camera, detectionId);
  if (!detection.imageStorageKey) {
    throw new HttpError(404, "No evidence frame is stored for this detection");
  }
  const bytes = await getAnprEvidenceStorage().read(detection.imageStorageKey);
  return { bytes, mimeType: "image/png" as const };
}

export async function listEntryCamerasForWeighbridge(actor: ActorContext, weighbridgeId: string) {
  const rows = await prisma.camera.findMany({
    where: {
      organizationId: actor.user.organizationId,
      weighbridgeId,
      purpose: "ENTRY_ANPR",
    },
    include: cameraInclude,
    orderBy: { name: "asc" },
  });
  return rows
    .filter((row) => canAccessSite(actor.user, row.siteId))
    .map((row) => toPublicCamera(row, getCameraConnectionManager().getSnapshot(row.id)));
}

async function finalizeLookup(
  actor: ActorContext,
  camera: CameraRow,
  detection: Awaited<ReturnType<typeof prisma.anprDetection.create>>,
  candidates: AnprCandidate[],
): Promise<PublicIdentification> {
  const plate = detection.normalizedPlate ?? "";
  const plateDetected = plate !== "";
  const vehicle = plateDetected ? await findVehicleByRegistration(actor, plate) : null;
  const decision = decideIdentification({
    confidenceBand: detection.confidenceBand,
    plateDetected,
    vehicleMatched: vehicle !== null,
    candidateCount: candidates.length,
  });

  let lifecycle: AnprDetectionLifecycle = detection.lifecycle;
  if (!plateDetected) {
    lifecycle = "DETECTED";
    recordFailure(actor, camera, detection.id);
  } else {
    failureCounts.set(camera.id, 0);
    lifecycle = vehicle ? (detection.confidenceBand === "HIGH" ? "MATCHED" : "CONFIRMATION_REQUIRED") : "NO_MATCH";
  }

  const updated = await prisma.anprDetection.update({
    where: { id: detection.id },
    data: {
      lifecycle,
      vehicleId: vehicle?.id ?? null,
    },
  });

  if (plateDetected && vehicle) {
    await writeIdentificationEvent(actor, camera, updated, "MATCHED", vehicle.id);
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.VEHICLE_MATCHED,
      entityType: "AnprDetection",
      entityId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { registrationNumber: vehicle.registrationNumber },
    });
  } else if (plateDetected) {
    await writeIdentificationEvent(actor, camera, updated, "NO_MATCH", null);
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.VEHICLE_NOT_FOUND,
      entityType: "AnprDetection",
      entityId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { registrationNumber: plate },
    });
    emitVehicleUnregistered({
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      detectionId: updated.id,
      plate,
      actor,
    });
  }

  return assembleIdentification(actor, camera, updated, vehicle, candidates, decision);
}

async function assembleIdentification(
  actor: ActorContext,
  camera: CameraRow,
  detection: {
    id: string;
    cameraId: string;
    weighbridgeId: string;
    transactionId: string | null;
    rawPlate: string | null;
    normalizedPlate: string | null;
    displayPlate: string | null;
    correctedPlate: string | null;
    selectedCandidatePlate: string | null;
    confidence: { toString(): string } | number | null;
    confidenceBand: PublicIdentification["detection"]["confidenceBand"];
    provider: string;
    source: PublicIdentification["detection"]["source"];
    simulated: boolean;
    lifecycle: AnprDetectionLifecycle;
    imageStorageKey: string | null;
    countryRegion: string | null;
    boundingBox: unknown;
    candidates: unknown;
    processingDurationMs: number;
    capturedAt: Date;
    vehicleId: string | null;
    correctionReason: string | null;
  },
  vehicle: PublicVehicle | null,
  candidates: AnprCandidate[],
  decisionOverride?: PublicIdentification["decision"],
): Promise<PublicIdentification> {
  const plate = detection.correctedPlate ?? detection.normalizedPlate ?? "";
  const recentTransactions =
    vehicle && actor.user.permissions.includes("transaction.read")
      ? await loadRecentTransactions(actor, vehicle.id)
      : [];
  const decision =
    decisionOverride ??
    decideIdentification({
      confidenceBand:
        detection.source === "MANUAL" || detection.correctedPlate
          ? "HIGH"
          : detection.confidenceBand,
      plateDetected: plate !== "",
      vehicleMatched: vehicle !== null,
      candidateCount: Math.max(candidates.length, plate === "" ? 0 : 1),
    });

  return {
    camera: toPublicCamera(camera, getCameraConnectionManager().getSnapshot(camera.id)),
    anprStatus: getAnprProvider("SIMULATOR").getStatus(),
    detection: toPublicDetection(detection),
    vehicle,
    recentTransactions,
    registered: vehicle !== null,
    decision:
      detection.source === "MANUAL"
        ? {
            action: vehicle ? "CONFIRM" : "NO_MATCH",
            message: vehicle
              ? "Manual vehicle number. Confirm to identify this visit."
              : "Vehicle not registered. Register it first if you are authorized.",
            autoSelectPlate: false,
          }
        : decision,
  };
}

async function loadRecentTransactions(actor: ActorContext, vehicleId: string) {
  const rows = await prisma.transaction.findMany({
    where: {
      organizationId: actor.user.organizationId,
      vehicleId,
      ...(canAccessSite(actor.user, actor.user.defaultSite?.id ?? "") || actor.user.roles.some((role) => role.site === null)
        ? {}
        : { siteId: { in: actor.user.roles.flatMap((role) => (role.site ? [role.site.id] : [])) } }),
    },
    orderBy: { arrivedAt: "desc" },
    take: 5,
    select: { id: true, referenceNumber: true, status: true, arrivedAt: true, siteId: true },
  });
  return rows
    .filter((row) => canAccessSite(actor.user, row.siteId))
    .map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber,
      status: row.status,
      arrivedAt: row.arrivedAt.toISOString(),
    }));
}

async function writeIdentificationEvent(
  actor: ActorContext,
  camera: CameraRow,
  detection: { id: string; rawPlate: string | null; normalizedPlate: string | null; correctedPlate: string | null; transactionId: string | null; source: "ANPR" | "MANUAL" },
  outcome: string,
  vehicleId: string | null,
  reason?: string | undefined,
): Promise<void> {
  await prisma.vehicleIdentificationEvent.create({
    data: {
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      weighbridgeId: camera.weighbridgeId,
      transactionId: detection.transactionId,
      detectionId: detection.id,
      source: detection.source,
      outcome,
      rawPlate: detection.rawPlate,
      normalizedPlate: detection.correctedPlate ?? detection.normalizedPlate ?? "",
      vehicleId,
      reason: reason ?? null,
      actorUserId: actor.user.id,
    },
  });
}

function recordFailure(actor: ActorContext, camera: CameraRow, detectionId: string): void {
  const next = (failureCounts.get(camera.id) ?? 0) + 1;
  failureCounts.set(camera.id, next);
  emitManualIdentificationRequired({
    organizationId: camera.organizationId,
    siteId: camera.siteId,
    cameraId: camera.id,
    detectionId,
    deviceName: camera.name,
    windowKey: hourKey(),
    actor,
  });
  if (next >= env.anprFailureAlertThreshold) {
    emitRepeatedAnprFailure({
      organizationId: camera.organizationId,
      siteId: camera.siteId,
      cameraId: camera.id,
      deviceName: camera.name,
      windowKey: hourKey(),
      actor,
    });
    failureCounts.set(camera.id, 0);
  }
}

function plateMatchesDetection(
  registrationNumber: string,
  detection: {
    normalizedPlate: string | null;
    correctedPlate: string | null;
    selectedCandidatePlate: string | null;
    candidates: unknown;
  },
): boolean {
  const plates = new Set<string>();
  if (detection.normalizedPlate) {
    plates.add(detection.normalizedPlate);
  }
  if (detection.correctedPlate) {
    plates.add(detection.correctedPlate);
  }
  if (detection.selectedCandidatePlate) {
    plates.add(detection.selectedCandidatePlate);
  }
  for (const candidate of asCandidates(detection.candidates)) {
    plates.add(candidate.normalizedPlateNumber);
  }
  return plates.has(registrationNumber);
}

function asCandidates(value: unknown): AnprCandidate[] {
  return Array.isArray(value) ? (value as AnprCandidate[]) : [];
}

function hourKey(): string {
  return new Date().toISOString().slice(0, 13);
}

async function ensureStarted(actor: ActorContext, cameraId: string): Promise<CameraRow> {
  const camera = await loadCamera(actor, cameraId);
  if (!camera.enabled) {
    throw new HttpError(409, "Camera is disabled");
  }
  if (!getCameraConnectionManager().has(camera.id)) {
    await getCameraConnectionManager().start(toCameraFactoryInput(camera));
  }
  return camera;
}

async function loadCamera(actor: ActorContext, cameraId: string): Promise<CameraRow> {
  const camera = await prisma.camera.findFirst({
    where: { id: cameraId, organizationId: actor.user.organizationId },
    include: cameraInclude,
  });
  if (!camera) {
    throw new HttpError(404, "Camera not found");
  }
  if (!canAccessSite(actor.user, camera.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  return camera;
}

async function loadDetection(camera: CameraRow, detectionId: string) {
  const detection = await prisma.anprDetection.findFirst({
    where: {
      id: detectionId,
      cameraId: camera.id,
      organizationId: camera.organizationId,
    },
  });
  if (!detection) {
    throw new HttpError(404, "ANPR detection not found");
  }
  return detection;
}
