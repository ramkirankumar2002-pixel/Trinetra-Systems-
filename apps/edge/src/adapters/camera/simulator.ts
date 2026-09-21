import type { ICameraProvider, NormalizedAnprResult } from "../types.js";

export class SimulatorCameraAdapter implements ICameraProvider {
  readonly deviceType = "CAMERA" as const;
  private connected = false;
  private lastCommunicationAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly plate = "APXX1234") {}

  async connect(): Promise<void> {
    this.connected = true;
    this.lastCommunicationAt = new Date().toISOString();
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  health() {
    return {
      status: this.connected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
      lastCommunicationAt: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  diagnostic() {
    return {
      testKind: "SIMULATED",
      connectionStatus: this.connected ? "CONNECTED" : "DISCONNECTED",
      lastFrame: this.connected,
      lastPlate: this.plate,
      confidence: 0.96,
      timestamp: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  async readPlate(): Promise<NormalizedAnprResult> {
    if (!this.connected) {
      this.lastError = "Camera adapter is not connected";
      throw new Error(this.lastError);
    }
    const capturedAt = new Date().toISOString();
    this.lastCommunicationAt = capturedAt;
    const normalized = this.plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    return {
      plateNumber: this.plate,
      normalizedPlateNumber: normalized,
      displayPlateNumber: normalized,
      confidence: 0.96,
      candidates: [{ plateNumber: this.plate, normalizedPlateNumber: normalized, confidence: 0.96 }],
      simulated: true,
      provider: "SIMULATOR",
      capturedAt,
    };
  }
}
