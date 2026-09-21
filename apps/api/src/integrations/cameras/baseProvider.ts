import type { CameraDeviceStatus } from "../../domain/cameraStatus.js";
import type { CameraFrame, CameraProviderStatus, ICameraProvider } from "./types.js";

export abstract class BaseCameraProvider implements ICameraProvider {
  protected status: CameraDeviceStatus = "DISCONNECTED";
  protected lastError: string | null = null;
  protected lastFrameAt: string | null = null;
  protected lastCommunicationAt: string | null = null;

  constructor(
    protected readonly cameraId: string,
    protected readonly weighbridgeId: string,
  ) {}

  abstract initialize(): Promise<void>;
  abstract captureFrame(): Promise<CameraFrame>;

  async shutdown(): Promise<void> {
    this.status = "DISCONNECTED";
  }

  getStatus(): CameraProviderStatus {
    return {
      status: this.status,
      lastError: this.lastError,
      lastFrameAt: this.lastFrameAt,
      lastCommunicationAt: this.lastCommunicationAt,
    };
  }

  protected markConnected(): void {
    this.status = "CONNECTED";
    this.lastError = null;
    this.lastCommunicationAt = new Date().toISOString();
  }

  protected markFrame(): void {
    const now = new Date().toISOString();
    this.lastFrameAt = now;
    this.lastCommunicationAt = now;
    this.lastError = null;
  }

  protected markError(message: string): void {
    this.status = "ERROR";
    this.lastError = message;
  }
}
