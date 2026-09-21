import { serialPortAvailability } from "../../domain/serialAvailability.js";
import type { IWeightProvider, NormalizedWeightReading } from "../types.js";

/** Serial foundation. Does not open a port or invent a protocol. */
export class SerialWeightAdapter implements IWeightProvider {
  readonly deviceType = "WEIGHBRIDGE_INDICATOR" as const;
  private lastError = "PROTOCOL DETAILS REQUIRED";
  private lastCommunicationAt: string | null = null;

  constructor(private readonly serialPort?: string) {}

  async connect(): Promise<void> {
    if (this.serialPort) {
      const availability = serialPortAvailability(this.serialPort);
      if (!availability.available) {
        this.lastError = "DEVICE NOT AVAILABLE";
        this.lastCommunicationAt = new Date().toISOString();
        return;
      }
    }
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
