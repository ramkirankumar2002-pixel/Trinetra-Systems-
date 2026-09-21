import { deriveDeviceHealth, type DeviceHealthSnapshot, type HardwareDeviceStatus } from "../../domain/hardwareStatus.js";
import type { NormalizedWeightReading } from "../../domain/normalizedWeight.js";
import type { ProviderType } from "../../domain/hardwareConfig.js";
import type { IWeightProvider, WeightListener } from "./provider.js";

export abstract class BaseWeightProvider implements IWeightProvider {
  protected status: HardwareDeviceStatus = "DISCONNECTED";
  protected lastReading: NormalizedWeightReading | null = null;
  protected lastError: string | null = null;
  protected lastCommunicationAt: Date | null = null;
  protected lastSuccessfulReadingAt: Date | null = null;
  private readonly listeners = new Set<WeightListener>();

  constructor(
    readonly id: string,
    readonly weighbridgeId: string,
    readonly providerType: ProviderType,
    private readonly healthTimeoutMs: number,
  ) {}

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract readNormalized(): Promise<NormalizedWeightReading>;

  getStatus(): HardwareDeviceStatus {
    return this.status;
  }

  subscribe(listener: WeightListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async healthCheck(): Promise<DeviceHealthSnapshot> {
    const snapshot = deriveDeviceHealth({
      enabled: this.status !== "DISABLED",
      status: this.status,
      lastCommunicationAt: this.lastCommunicationAt,
      lastSuccessfulReadingAt: this.lastSuccessfulReadingAt,
      lastError: this.lastError,
      now: new Date(),
      healthTimeoutMs: this.healthTimeoutMs,
    });
    return {
      ...snapshot,
      lastConnectedAt: this.status === "CONNECTED" ? (this.lastCommunicationAt?.toISOString() ?? null) : snapshot.lastConnectedAt,
    };
  }

  protected emit(reading: NormalizedWeightReading): void {
    this.lastReading = reading;
    this.lastCommunicationAt = new Date();
    if (reading.quality === "STABLE" || reading.quality === "UNSTABLE") {
      this.lastSuccessfulReadingAt = this.lastCommunicationAt;
      this.lastError = null;
    }
    if (reading.quality === "DEVICE_ERROR" && reading.statusDetail) {
      this.lastError = reading.statusDetail;
    }
    for (const listener of this.listeners) {
      listener(reading);
    }
  }

  protected setStatus(status: HardwareDeviceStatus, error: string | null = null): void {
    this.status = status;
    this.lastError = error;
  }
}
