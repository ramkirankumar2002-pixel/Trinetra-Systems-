import { milligramsToKgDecimal } from "./netWeight.js";
import type { HardwareDeviceStatus } from "./hardwareStatus.js";
import type { WeightQuality } from "./weightQuality.js";
import type { WeightUnit } from "./weightUnits.js";

export const WEIGHMENT_CAPTURE_SOURCES = ["HARDWARE", "SIMULATOR", "MANUAL"] as const;
export type WeighmentCaptureSource = (typeof WEIGHMENT_CAPTURE_SOURCES)[number];

export type NormalizedWeightReading = {
  milliKg: bigint;
  weightKg: string;
  unit: WeightUnit;
  quality: WeightQuality;
  timestamp: string;
  providerType: string;
  source: WeighmentCaptureSource;
  deviceIdentifier: string;
  weighbridgeId: string;
  connectionStatus: HardwareDeviceStatus;
  raw: string | null;
  statusDetail: string | null;
};

export function readingFromMilliKg(input: {
  milliKg: bigint;
  unit: WeightUnit;
  quality: WeightQuality;
  timestamp?: Date;
  providerType: string;
  source: WeighmentCaptureSource;
  deviceIdentifier: string;
  weighbridgeId: string;
  connectionStatus: HardwareDeviceStatus;
  raw?: string | null;
  statusDetail?: string | null;
}): NormalizedWeightReading {
  return {
    milliKg: input.milliKg,
    weightKg: milligramsToKgDecimal(input.milliKg),
    unit: input.unit,
    quality: input.quality,
    timestamp: (input.timestamp ?? new Date()).toISOString(),
    providerType: input.providerType,
    source: input.source,
    deviceIdentifier: input.deviceIdentifier,
    weighbridgeId: input.weighbridgeId,
    connectionStatus: input.connectionStatus,
    raw: input.raw ?? null,
    statusDetail: input.statusDetail ?? null,
  };
}

export function emptyReading(input: {
  weighbridgeId: string;
  deviceIdentifier: string;
  providerType: string;
  source: WeighmentCaptureSource;
  quality: WeightQuality;
  connectionStatus: HardwareDeviceStatus;
  unit?: WeightUnit;
  statusDetail?: string | null;
}): NormalizedWeightReading {
  return readingFromMilliKg({
    milliKg: 0n,
    unit: input.unit ?? "KG",
    quality: input.quality,
    providerType: input.providerType,
    source: input.source,
    deviceIdentifier: input.deviceIdentifier,
    weighbridgeId: input.weighbridgeId,
    connectionStatus: input.connectionStatus,
    statusDetail: input.statusDetail ?? null,
  });
}

export function toPublicLiveWeight(reading: NormalizedWeightReading) {
  return {
    weightKg: reading.quality === "STABLE" || reading.quality === "UNSTABLE" ? reading.weightKg : null,
    unit: reading.unit,
    quality: reading.quality,
    timestamp: reading.timestamp,
    providerType: reading.providerType,
    source: reading.source,
    deviceIdentifier: reading.deviceIdentifier,
    weighbridgeId: reading.weighbridgeId,
    connectionStatus: reading.connectionStatus,
    statusDetail: reading.statusDetail,
  };
}
