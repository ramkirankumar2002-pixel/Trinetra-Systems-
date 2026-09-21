import { apiRequest } from "../../shared/api/client.ts";
import type { PublicVehicle } from "../vehicles/api.ts";

export type PublicCamera = {
  id: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  weighbridgeName: string;
  site: { id: string; code: string; name: string };
  name: string;
  cameraIdentifier: string;
  purpose: string;
  cameraProviderType: string;
  connectionType: string;
  anprProviderType: string;
  enabled: boolean;
  status: string;
  anprStatus: string;
  healthy: boolean;
  simulated: boolean;
  direction: string | null;
  highConfidenceMin: number;
  mediumConfidenceMin: number;
  simulatorScenario: string;
  lastFrameAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
};

export type AnprCandidate = {
  plateNumber: string;
  normalizedPlateNumber: string;
  confidence: number;
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
  confidence: number | null;
  confidenceBand: string;
  provider: string;
  source: string;
  simulated: boolean;
  lifecycle: string;
  imageStorageKey: string | null;
  candidates: AnprCandidate[];
  processingDurationMs: number;
  capturedAt: string;
  vehicleId: string | null;
};

export type IdentificationDecision = {
  action: string;
  message: string;
  autoSelectPlate: boolean;
};

export type PublicIdentification = {
  camera: PublicCamera;
  anprStatus: { status: string; provider: string; simulated: boolean; lastError: string | null };
  detection: PublicAnprDetection;
  vehicle: PublicVehicle | null;
  recentTransactions: Array<{ id: string; referenceNumber: string; status: string; arrivedAt: string }>;
  registered: boolean;
  decision: IdentificationDecision;
};

export function listCameras(): Promise<{ items: PublicCamera[] }> {
  return apiRequest<{ items: PublicCamera[] }>("/api/v1/cameras");
}

export function getCameraStatus(cameraId: string): Promise<{
  camera: PublicCamera;
  anpr: { status: string; provider: string; simulated: boolean; lastError: string | null };
}> {
  return apiRequest(`/api/v1/cameras/${cameraId}/status`);
}

export function enableCamera(cameraId: string): Promise<{ camera: PublicCamera }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/enable`, { method: "POST" });
}

export function disableCamera(cameraId: string): Promise<{ camera: PublicCamera }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/disable`, { method: "POST" });
}

export function testCamera(cameraId: string): Promise<{ ok: boolean; message: string; camera: PublicCamera }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/test`, { method: "POST" });
}

export function updateCamera(
  cameraId: string,
  payload: { simulatorScenario?: string; enabled?: boolean },
): Promise<{ camera: PublicCamera }> {
  return apiRequest(`/api/v1/cameras/${cameraId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function recognizeCamera(
  cameraId: string,
  scenario?: string,
): Promise<{ identification: PublicIdentification }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/recognize`, {
    method: "POST",
    body: JSON.stringify(scenario ? { scenario } : {}),
  });
}

export function correctDetection(
  cameraId: string,
  detectionId: string,
  plate: string,
  reason?: string,
): Promise<{ identification: PublicIdentification }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/detections/${detectionId}/correct`, {
    method: "POST",
    body: JSON.stringify(reason ? { plate, reason } : { plate }),
  });
}

export function manualIdentify(
  cameraId: string,
  plate: string,
): Promise<{ identification: PublicIdentification }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/identify/manual`, {
    method: "POST",
    body: JSON.stringify({ plate }),
  });
}

export function confirmIdentification(
  cameraId: string,
  detectionId: string,
  vehicleId: string,
): Promise<{ identification: PublicIdentification }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/detections/${detectionId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ vehicleId }),
  });
}

export function rejectDetection(
  cameraId: string,
  detectionId: string,
): Promise<{ identification: PublicIdentification }> {
  return apiRequest(`/api/v1/cameras/${cameraId}/detections/${detectionId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function detectionFrameUrl(cameraId: string, detectionId: string): string {
  return `/api/v1/cameras/${cameraId}/detections/${detectionId}/frame`;
}

export function confidenceLabel(confidence: number | null): string {
  if (confidence === null) {
    return "—";
  }
  return `${Math.round(confidence * 100)}%`;
}

export function sourceBadge(source: string, simulated: boolean): string {
  if (source === "MANUAL") {
    return "MANUAL";
  }
  return simulated ? "SIMULATED" : "ANPR";
}
