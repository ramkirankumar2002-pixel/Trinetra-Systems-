import type {
  AnprConfidenceBand,
  AnprDetectionLifecycle,
  AnprDetectionSource,
  AnprProviderStatus,
  CameraConnectionType,
  CameraProviderType,
  CameraPurpose,
  HardwareDeviceStatus,
} from "@prisma/client";
import { publicConfiguredUrl } from "../../domain/cameraConfig.js";
import type { IdentificationDecision } from "../../domain/identificationDecision.js";
import type { AnprCandidate } from "../../domain/anprResult.js";
import type { ManagedCameraSnapshot } from "../../integrations/cameras/connectionManager.js";
import type { PublicVehicle } from "../vehicles/mapper.js";

export type PublicCamera = {
  id: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  weighbridgeName: string;
  site: { id: string; code: string; name: string };
  name: string;
  cameraIdentifier: string;
  purpose: CameraPurpose;
  cameraProviderType: CameraProviderType;
  connectionType: CameraConnectionType;
  anprProviderType: string;
  enabled: boolean;
  status: HardwareDeviceStatus;
  anprStatus: AnprProviderStatus;
  healthy: boolean;
  simulated: boolean;
  direction: string | null;
  snapshotUrl: string | null;
  streamUrl: string | null;
  highConfidenceMin: number;
  mediumConfidenceMin: number;
  simulatorScenario: string;
  lastFrameAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastFrameStorageKey: string | null;
};

export type PublicAnprDetection = {
  id: string;
  cameraId: string;
  weighbridgeId: string;
  transactionId: string | null;
  rawPlate: string | null;
  normalizedPlate: string | null;
  displayPlate: string | null;
  correctedPlate: string | null;
  selectedCandidatePlate: string | null;
  confidence: number | null;
  confidenceBand: AnprConfidenceBand;
  provider: string;
  source: AnprDetectionSource;
  simulated: boolean;
  lifecycle: AnprDetectionLifecycle;
  imageStorageKey: string | null;
  countryRegion: string | null;
  boundingBox: unknown;
  candidates: AnprCandidate[];
  processingDurationMs: number;
  capturedAt: string;
  vehicleId: string | null;
  correctionReason: string | null;
};

export type PublicIdentification = {
  camera: PublicCamera;
  anprStatus: { status: string; provider: string; simulated: boolean; lastError: string | null };
  detection: PublicAnprDetection;
  vehicle: PublicVehicle | null;
  recentTransactions: Array<{
    id: string;
    referenceNumber: string;
    status: string;
    arrivedAt: string;
  }>;
  registered: boolean;
  decision: IdentificationDecision;
};

export type CameraRow = {
  id: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  name: string;
  cameraIdentifier: string;
  purpose: CameraPurpose;
  cameraProviderType: CameraProviderType;
  connectionType: CameraConnectionType;
  anprProviderType: "SIMULATOR";
  enabled: boolean;
  direction: string | null;
  snapshotUrl: string | null;
  streamUrl: string | null;
  highConfidenceMin: { toString(): string } | number;
  mediumConfidenceMin: { toString(): string } | number;
  simulatorScenario: string;
  lastStatus: HardwareDeviceStatus;
  lastAnprStatus: AnprProviderStatus;
  lastFrameAt: Date | null;
  lastCommunicationAt: Date | null;
  lastError: string | null;
  lastFrameStorageKey: string | null;
  weighbridge: { code: string; name: string };
  site: { id: string; code: string; name: string };
};

export function toPublicCamera(camera: CameraRow, live: ManagedCameraSnapshot | null): PublicCamera {
  return {
    id: camera.id,
    weighbridgeId: camera.weighbridgeId,
    weighbridgeCode: camera.weighbridge.code,
    weighbridgeName: camera.weighbridge.name,
    site: camera.site,
    name: camera.name,
    cameraIdentifier: camera.cameraIdentifier,
    purpose: camera.purpose,
    cameraProviderType: camera.cameraProviderType,
    connectionType: camera.connectionType,
    anprProviderType: camera.anprProviderType,
    enabled: live?.enabled ?? camera.enabled,
    status: live?.status ?? camera.lastStatus,
    anprStatus: camera.lastAnprStatus,
    healthy: live?.health.healthy ?? false,
    simulated: camera.cameraProviderType === "SIMULATOR",
    direction: camera.direction,
    snapshotUrl: publicConfiguredUrl(camera.snapshotUrl),
    streamUrl: publicConfiguredUrl(camera.streamUrl),
    highConfidenceMin: Number(camera.highConfidenceMin.toString()),
    mediumConfidenceMin: Number(camera.mediumConfidenceMin.toString()),
    simulatorScenario: camera.simulatorScenario,
    lastFrameAt: live?.lastFrameAt ?? camera.lastFrameAt?.toISOString() ?? null,
    lastCommunicationAt: live?.lastCommunicationAt ?? camera.lastCommunicationAt?.toISOString() ?? null,
    lastError: live?.lastError ?? camera.lastError,
    lastFrameStorageKey: camera.lastFrameStorageKey,
  };
}

export function toPublicDetection(row: {
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
  confidenceBand: AnprConfidenceBand;
  provider: string;
  source: AnprDetectionSource;
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
}): PublicAnprDetection {
  return {
    id: row.id,
    cameraId: row.cameraId,
    weighbridgeId: row.weighbridgeId,
    transactionId: row.transactionId,
    rawPlate: row.rawPlate,
    normalizedPlate: row.normalizedPlate,
    displayPlate: row.displayPlate,
    correctedPlate: row.correctedPlate,
    selectedCandidatePlate: row.selectedCandidatePlate,
    confidence: row.confidence === null ? null : Number(row.confidence.toString()),
    confidenceBand: row.confidenceBand,
    provider: row.provider,
    source: row.source,
    simulated: row.simulated,
    lifecycle: row.lifecycle,
    imageStorageKey: row.imageStorageKey,
    countryRegion: row.countryRegion,
    boundingBox: row.boundingBox,
    candidates: Array.isArray(row.candidates) ? (row.candidates as AnprCandidate[]) : [],
    processingDurationMs: row.processingDurationMs,
    capturedAt: row.capturedAt.toISOString(),
    vehicleId: row.vehicleId,
    correctionReason: row.correctionReason,
  };
}
