import { parseModbusMapping } from "../../../domain/modbusMapping.js";
import { emptyReading, type NormalizedWeightReading } from "../../../domain/normalizedWeight.js";
import { BaseWeightProvider } from "../baseProvider.js";
import type { ProviderFactoryInput } from "../provider.js";

/**
 * Modbus RTU/TCP foundation.
 * Register addresses are never invented. A manufacturer map must be supplied before a live read is possible.
 */
export class ModbusWeightProvider extends BaseWeightProvider {
  private readonly deviceIdentifier: string;
  private readonly mappingError: string | null;

  constructor(input: ProviderFactoryInput) {
    super(
      input.profileId,
      input.weighbridgeId,
      input.providerType === "MODBUS_RTU" ? "MODBUS_RTU" : "MODBUS_TCP",
      input.healthTimeoutMs,
    );
    this.deviceIdentifier = input.deviceIdentifier;
    const mapping = parseModbusMapping(input.modbusMapping);
    this.mappingError = typeof mapping === "string" ? mapping : null;
  }

  async connect(): Promise<void> {
    if (this.mappingError) {
      this.setStatus("ERROR", this.mappingError);
      return;
    }
    this.setStatus(
      "ERROR",
      "Modbus transport is not connected. Register maps must come from the indicator manufacturer and are not assumed.",
    );
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
      statusDetail: this.lastError ?? "Modbus weight registers are not available",
    });
    this.emit(reading);
    return reading;
  }
}
