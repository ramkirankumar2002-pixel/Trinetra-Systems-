import type { HardwareDeviceStatus, WeightQuality, WeighbridgeProviderType, WeighmentSource } from "@prisma/client";
import { defaultConnectionType, type HardwareConfigInput, type SimulatorMode } from "../../domain/hardwareConfig.js";
import type { DeviceHealthSnapshot } from "../../domain/hardwareStatus.js";
import { toPublicLiveWeight, type NormalizedWeightReading } from "../../domain/normalizedWeight.js";
import type { ManagedDeviceSnapshot } from "../../integrations/weighbridge/connectionManager.js";
import { isWeightUnit } from "../../domain/weightUnits.js";

export type PublicHardwareDevice = {
  id: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  weighbridgeName: string;
  site: { id: string; code: string; name: string };
  deviceName: string;
  deviceIdentifier: string;
  providerType: WeighbridgeProviderType;
  connectionType: string;
  enabled: boolean;
  status: HardwareDeviceStatus;
  healthy: boolean;
  unit: string;
  lastWeightKg: string | null;
  lastQuality: WeightQuality | null;
  lastReadingAt: string | null;
  lastConnectedAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastSource: WeighmentSource | null;
  pollingIntervalMs: number;
  connectionTimeoutMs: number;
  healthTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  stabilityToleranceKg: string;
  stabilityConsecutive: number;
  stabilityDurationMs: number;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  baudRate: number | null;
  dataBits: number | null;
  stopBits: number | null;
  parity: string | null;
  protocol: string | null;
  modbusMapping: unknown;
  simulatorMode: string;
  simulatorBaseKg: string | null;
};

export function toPublicHardwareDevice(
  profile: ProfileRow,
  live: ManagedDeviceSnapshot | null,
): PublicHardwareDevice {
  const lastReading = live?.lastReading ?? null;
  return {
    id: profile.id,
    weighbridgeId: profile.weighbridgeId,
    weighbridgeCode: profile.weighbridge.code,
    weighbridgeName: profile.weighbridge.name,
    site: profile.site,
    deviceName: profile.deviceName,
    deviceIdentifier: profile.deviceIdentifier,
    providerType: profile.providerType,
    connectionType: profile.connectionType,
    enabled: live?.enabled ?? profile.enabled,
    status: live?.status ?? profile.lastStatus,
    healthy: live?.health.healthy ?? false,
    unit: profile.unit,
    lastWeightKg: lastReading?.weightKg ?? profile.lastWeightKg?.toString() ?? null,
    lastQuality: lastReading?.quality ?? profile.lastQuality,
    lastReadingAt: lastReading?.timestamp ?? profile.lastReadingAt?.toISOString() ?? null,
    lastConnectedAt: live?.lastConnectedAt ?? profile.lastConnectedAt?.toISOString() ?? null,
    lastCommunicationAt: live?.health.lastCommunicationAt ?? profile.lastReadingAt?.toISOString() ?? null,
    lastError: live?.lastError ?? profile.lastError,
    lastSource: sourceFromReading(lastReading) ?? profile.lastSource,
    pollingIntervalMs: profile.pollingIntervalMs,
    connectionTimeoutMs: profile.connectionTimeoutMs,
    healthTimeoutMs: profile.healthTimeoutMs,
    reconnectEnabled: profile.reconnectEnabled,
    reconnectDelayMs: profile.reconnectDelayMs,
    maxReconnectAttempts: profile.maxReconnectAttempts,
    stabilityToleranceKg: profile.stabilityToleranceKg.toString(),
    stabilityConsecutive: profile.stabilityConsecutive,
    stabilityDurationMs: profile.stabilityDurationMs,
    host: profile.host,
    port: profile.port,
    serialPort: profile.serialPort,
    baudRate: profile.baudRate,
    dataBits: profile.dataBits,
    stopBits: profile.stopBits,
    parity: profile.parity,
    protocol: profile.protocol,
    modbusMapping: profile.modbusMapping,
    simulatorMode: profile.simulatorMode,
    simulatorBaseKg: profile.simulatorBaseKg?.toString() ?? null,
  };
}

export function toConfigInput(profile: ProfileRow): HardwareConfigInput {
  return {
    providerType: profile.providerType,
    connectionType: profile.connectionType || defaultConnectionType(profile.providerType),
    deviceName: profile.deviceName,
    deviceIdentifier: profile.deviceIdentifier,
    enabled: profile.enabled,
    unit: isWeightUnit(profile.unit) ? profile.unit : "KG",
    pollingIntervalMs: profile.pollingIntervalMs,
    connectionTimeoutMs: profile.connectionTimeoutMs,
    healthTimeoutMs: profile.healthTimeoutMs,
    reconnectEnabled: profile.reconnectEnabled,
    reconnectDelayMs: profile.reconnectDelayMs,
    maxReconnectAttempts: profile.maxReconnectAttempts,
    stabilityToleranceKg: profile.stabilityToleranceKg.toString(),
    stabilityConsecutive: profile.stabilityConsecutive,
    stabilityDurationMs: profile.stabilityDurationMs,
    simulatorMode: profile.simulatorMode as SimulatorMode,
    ...(profile.host ? { host: profile.host } : {}),
    ...(profile.port !== null ? { port: profile.port } : {}),
    ...(profile.serialPort ? { serialPort: profile.serialPort } : {}),
    ...(profile.baudRate !== null ? { baudRate: profile.baudRate } : {}),
    ...(profile.dataBits !== null ? { dataBits: profile.dataBits } : {}),
    ...(profile.stopBits !== null ? { stopBits: profile.stopBits } : {}),
    ...(profile.parity ? { parity: profile.parity } : {}),
    ...(profile.protocol ? { protocol: profile.protocol } : {}),
    ...(profile.modbusMapping !== null && profile.modbusMapping !== undefined
      ? { modbusMapping: profile.modbusMapping }
      : {}),
    ...(profile.simulatorBaseKg ? { simulatorBaseKg: profile.simulatorBaseKg.toString() } : {}),
  };
}

export function publicLiveWeight(
  device: PublicHardwareDevice,
  reading: NormalizedWeightReading | null,
  health: DeviceHealthSnapshot | null,
) {
  return {
    device: {
      weighbridgeId: device.weighbridgeId,
      weighbridgeCode: device.weighbridgeCode,
      deviceName: device.deviceName,
      deviceIdentifier: device.deviceIdentifier,
      providerType: device.providerType,
      status: device.status,
      healthy: health?.healthy ?? device.healthy,
      enabled: device.enabled,
    },
    reading: reading
      ? toPublicLiveWeight(reading)
      : {
          weightKg: device.lastWeightKg,
          unit: device.unit,
          quality: device.lastQuality ?? "NO_DATA",
          timestamp: device.lastReadingAt,
          providerType: device.providerType,
          source: device.lastSource === "HARDWARE" ? "HARDWARE" : device.lastSource === "SIMULATED" ? "SIMULATOR" : "MANUAL",
          deviceIdentifier: device.deviceIdentifier,
          weighbridgeId: device.weighbridgeId,
          connectionStatus: device.status,
          statusDetail: device.lastError,
        },
  };
}

export type ProfileRow = {
  id: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  providerType: WeighbridgeProviderType;
  connectionType: string;
  deviceName: string;
  deviceIdentifier: string;
  enabled: boolean;
  unit: string;
  pollingIntervalMs: number;
  connectionTimeoutMs: number;
  healthTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  stabilityToleranceKg: { toString(): string };
  stabilityConsecutive: number;
  stabilityDurationMs: number;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  baudRate: number | null;
  dataBits: number | null;
  stopBits: number | null;
  parity: string | null;
  protocol: string | null;
  modbusMapping: unknown;
  simulatorMode: string;
  simulatorBaseKg: { toString(): string } | null;
  lastStatus: HardwareDeviceStatus;
  lastConnectedAt: Date | null;
  lastReadingAt: Date | null;
  lastError: string | null;
  lastWeightKg: { toString(): string } | null;
  lastQuality: WeightQuality | null;
  lastSource: WeighmentSource | null;
  weighbridge: { code: string; name: string };
  site: { id: string; code: string; name: string };
};

function sourceFromReading(reading: NormalizedWeightReading | null): WeighmentSource | null {
  if (!reading) {
    return null;
  }
  if (reading.source === "HARDWARE") {
    return "HARDWARE";
  }
  if (reading.source === "SIMULATOR") {
    return "SIMULATED";
  }
  return "MANUAL";
}
