import { serialPortAvailability } from "../../domain/serialAvailability.js";
import type { BackendDevice } from "../../gateway/client.js";
import type { IWeightProvider, NormalizedWeightReading } from "../types.js";

/**
 * Safe placeholder for a real indicator. Never opens a live serial/TCP session
 * because manufacturer protocol documentation is not available.
 */
export class UndeployedWeightAdapter implements IWeightProvider {
  readonly deviceType = "WEIGHBRIDGE_INDICATOR" as const;
  private lastError: string;
  private lastCommunicationAt: string | null = null;

  constructor(private readonly device: BackendDevice) {
    this.lastError = describeUnavailable(device);
  }

  async connect(): Promise<void> {
    this.lastError = describeUnavailable(this.device);
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
      raw: null,
      parsedWeightKg: null,
      stable: null,
      timestamp: this.lastCommunicationAt,
      parserStatus: "PROTOCOL_DETAILS_REQUIRED",
      lastError: this.lastError,
    };
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

function describeUnavailable(device: BackendDevice): string {
  if (device.serialPort) {
    const availability = serialPortAvailability(device.serialPort);
    if (!availability.available) {
      return "DEVICE NOT AVAILABLE";
    }
  }
  return "PROTOCOL DETAILS REQUIRED";
}
