import type {
  CameraConnectionTypeValue,
  CameraProviderTypeValue,
  CameraSimulatorScenario,
} from "../../domain/cameraConfig.js";
import type { CameraDeviceStatus } from "../../domain/cameraStatus.js";

export type CameraFrameSource = "SIMULATED" | "HARDWARE";

export type CameraFrame = {
  cameraId: string;
  weighbridgeId: string;
  capturedAt: string;
  mimeType: "image/png";
  bytes: Buffer;
  source: CameraFrameSource;
  scenario?: CameraSimulatorScenario | undefined;
  width: number;
  height: number;
};

export type CameraProviderStatus = {
  status: CameraDeviceStatus;
  lastError: string | null;
  lastFrameAt: string | null;
  lastCommunicationAt: string | null;
};

export type CameraFactoryInput = {
  cameraId: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  name: string;
  cameraIdentifier: string;
  cameraProviderType: CameraProviderTypeValue;
  connectionType: CameraConnectionTypeValue;
  enabled: boolean;
  snapshotUrl?: string | undefined;
  streamUrl?: string | undefined;
  simulatorScenario: CameraSimulatorScenario;
};

export interface ICameraProvider {
  initialize(): Promise<void>;
  captureFrame(): Promise<CameraFrame>;
  getStatus(): CameraProviderStatus;
  shutdown(): Promise<void>;
}
