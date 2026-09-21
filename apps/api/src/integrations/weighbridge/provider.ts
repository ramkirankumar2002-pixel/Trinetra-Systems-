import type { DeviceHealthSnapshot, HardwareDeviceStatus } from "../../domain/hardwareStatus.js";
import type { NormalizedWeightReading } from "../../domain/normalizedWeight.js";
import type { ProviderType } from "../../domain/hardwareConfig.js";

export type WeightListener = (reading: NormalizedWeightReading) => void;

export interface IWeightProvider {
  readonly id: string;
  readonly weighbridgeId: string;
  readonly providerType: ProviderType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): HardwareDeviceStatus;
  readNormalized(): Promise<NormalizedWeightReading>;
  healthCheck(): Promise<DeviceHealthSnapshot>;
  subscribe(listener: WeightListener): () => void;
}

export type ProviderFactoryInput = {
  profileId: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  deviceName: string;
  deviceIdentifier: string;
  providerType: ProviderType;
  unit: "KG" | "TONNE";
  pollingIntervalMs: number;
  connectionTimeoutMs: number;
  healthTimeoutMs: number;
  host?: string | undefined;
  port?: number | undefined;
  serialPort?: string | undefined;
  baudRate?: number | undefined;
  dataBits?: number | undefined;
  stopBits?: number | undefined;
  parity?: string | undefined;
  protocol?: string | undefined;
  modbusMapping?: unknown;
  simulatorMode: "AUTO" | "STABLE" | "UNSTABLE" | "DISCONNECTED";
  simulatorBaseKg?: string | null | undefined;
  stabilityToleranceKg: string;
  stabilityConsecutive: number;
  stabilityDurationMs: number;
};
