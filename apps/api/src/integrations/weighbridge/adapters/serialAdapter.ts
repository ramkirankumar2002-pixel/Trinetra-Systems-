import { emptyReading, type NormalizedWeightReading } from "../../../domain/normalizedWeight.js";
import { BaseWeightProvider } from "../baseProvider.js";
import type { ProviderFactoryInput } from "../provider.js";

/**
 * Serial foundation. No physical port is opened in this environment.
 * A future manufacturer adapter may use a serial library once the indicator protocol is documented.
 */
export class SerialWeightProvider extends BaseWeightProvider {
  private readonly deviceIdentifier: string;

  constructor(input: ProviderFactoryInput) {
    super(input.profileId, input.weighbridgeId, input.providerType === "MODBUS_RTU" ? "MODBUS_RTU" : "SERIAL", input.healthTimeoutMs);
    this.deviceIdentifier = input.deviceIdentifier;
  }

  async connect(): Promise<void> {
    this.setStatus("ERROR", "DEVICE NOT AVAILABLE");
  }

  async disconnect(): Promise<void> {
    this.setStatus("DISCONNECTED");
  }

  async readNormalized(): Promise<NormalizedWeightReading> {
    const reading = emptyReading({
      weighbridgeId: this.weighbridgeId,
      deviceIdentifier: this.deviceIdentifier,
      providerType: this.providerType,
      source: "HARDWARE",
      quality: "DEVICE_ERROR",
      connectionStatus: this.status,
      statusDetail: this.lastError ?? "Serial port is not available",
    });
    this.emit(reading);
    return reading;
  }
}
