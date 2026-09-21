import type { IWeightProvider, NormalizedWeightReading } from "../types.js";

/** TCP foundation. Does not connect to arbitrary hosts or invent a protocol. */
export class TcpWeightAdapter implements IWeightProvider {
  readonly deviceType = "WEIGHBRIDGE_INDICATOR" as const;
  private lastError = "PROTOCOL DETAILS REQUIRED";
  private lastCommunicationAt: string | null = null;

  async connect(): Promise<void> {
    this.lastError = "PROTOCOL DETAILS REQUIRED";
    this.lastCommunicationAt = new Date().toISOString();
  }

  async disconnect(): Promise<void> {}

  health() {
    return { status: "ERROR" as const, lastCommunicationAt: this.lastCommunicationAt, lastError: this.lastError };
  }

  async readWeight(): Promise<NormalizedWeightReading> {
    return {
      weightKg: 0,
      unit: "KG",
      quality: "DEVICE_ERROR",
      connectionStatus: "ERROR",
      source: "HARDWARE",
      capturedAt: new Date().toISOString(),
    };
  }
}
