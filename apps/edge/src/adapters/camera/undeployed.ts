import type { ICameraProvider, NormalizedAnprResult } from "../types.js";

export class UndeployedCameraAdapter implements ICameraProvider {
  readonly deviceType = "CAMERA" as const;
  private lastError = "PROTOCOL DETAILS REQUIRED";
  private lastCommunicationAt: string | null = null;

  async connect(): Promise<void> {
    this.lastCommunicationAt = new Date().toISOString();
  }

  async disconnect(): Promise<void> {}

  health() {
    return {
      status: "ERROR" as const,
      lastCommunicationAt: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  diagnostic() {
    return {
      testKind: "UNAVAILABLE",
      connectionStatus: "ERROR",
      lastFrame: null,
      lastPlate: null,
      lastError: this.lastError,
    };
  }

  async readPlate(): Promise<NormalizedAnprResult> {
    throw new Error(this.lastError);
  }
}
