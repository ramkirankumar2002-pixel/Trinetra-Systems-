import { HardwareDeviceStatus, WeighbridgeProviderType } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { isWeightUnit } from "../../domain/weightUnits.js";
import type { SimulatorMode } from "../../domain/hardwareConfig.js";
import { ingestNormalizedReading } from "../../modules/anomalies/ingest.js";
import { emitHardwareTransition } from "./alerts.js";
import { ConnectionManager, getConnectionManager, setConnectionManager, type ManagedDeviceSnapshot } from "./connectionManager.js";
import type { ProviderFactoryInput } from "./provider.js";

const SIMULATOR_MODES = new Set(["AUTO", "STABLE", "UNSTABLE", "DISCONNECTED"]);

export async function startHardwareRuntime(): Promise<void> {
  const manager = new ConnectionManager({
    persist: persistSnapshot,
    onTransition: emitHardwareTransition,
    onReading: (event) => {
      void ingestNormalizedReading({
        weighbridgeId: event.weighbridgeId,
        organizationId: event.organizationId,
        siteId: event.siteId,
        reading: event.reading,
      }).catch((error) => {
        console.error("Weight anomaly ingest failed", {
          weighbridgeId: event.weighbridgeId,
          error: error instanceof Error ? error.message : "unknown",
        });
      });
    },
  });
  setConnectionManager(manager);

  const profiles = await prisma.weighbridgeHardwareProfile.findMany({
    where: {
      enabled: true,
      providerType: WeighbridgeProviderType.SIMULATOR,
    },
    include: {
      weighbridge: { select: { code: true, name: true, isActive: true } },
    },
  });

  let started = 0;
  for (const profile of profiles) {
    if (!profile.weighbridge.isActive) {
      continue;
    }
    try {
      await manager.start(toFactoryInput(profile));
      started += 1;
    } catch (error) {
      console.error("Hardware runtime failed to start simulator", {
        weighbridgeId: profile.weighbridgeId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  console.log(`Hardware runtime started ${started} simulator adapter(s)`);
}

export async function stopHardwareRuntime(): Promise<void> {
  const manager = getConnectionManager();
  await manager.shutdown();
}

export function toFactoryInput(profile: {
  id: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  providerType: WeighbridgeProviderType;
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
  stabilityToleranceKg: { toString(): string } | string;
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
  simulatorBaseKg: { toString(): string } | string | null;
  weighbridge?: { code: string; name: string };
}): ProviderFactoryInput & {
  organizationId: string;
  siteId: string;
  deviceName: string;
  enabled: boolean;
  reconnectEnabled: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
} {
  const unit = isWeightUnit(profile.unit) ? profile.unit : "KG";
  const simulatorMode = SIMULATOR_MODES.has(profile.simulatorMode)
    ? (profile.simulatorMode as SimulatorMode)
    : "AUTO";

  return {
    profileId: profile.id,
    organizationId: profile.organizationId,
    siteId: profile.siteId,
    weighbridgeId: profile.weighbridgeId,
    weighbridgeCode: profile.weighbridge?.code ?? profile.deviceIdentifier,
    deviceName: profile.deviceName,
    deviceIdentifier: profile.deviceIdentifier,
    providerType: profile.providerType,
    unit,
    pollingIntervalMs: profile.pollingIntervalMs,
    connectionTimeoutMs: profile.connectionTimeoutMs,
    healthTimeoutMs: profile.healthTimeoutMs,
    reconnectEnabled: profile.reconnectEnabled,
    reconnectDelayMs: profile.reconnectDelayMs,
    maxReconnectAttempts: profile.maxReconnectAttempts,
    enabled: profile.enabled,
    simulatorMode,
    stabilityToleranceKg: profile.stabilityToleranceKg.toString(),
    stabilityConsecutive: profile.stabilityConsecutive,
    stabilityDurationMs: profile.stabilityDurationMs,
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

async function persistSnapshot(snapshot: ManagedDeviceSnapshot): Promise<void> {
  try {
    const usableReading =
      snapshot.lastReading && (snapshot.lastReading.quality === "STABLE" || snapshot.lastReading.quality === "UNSTABLE")
        ? snapshot.lastReading
        : null;
    await prisma.weighbridgeHardwareProfile.update({
      where: { id: snapshot.profileId },
      data: {
        lastStatus: snapshot.status as HardwareDeviceStatus,
        lastError: snapshot.lastError,
        ...(snapshot.lastConnectedAt ? { lastConnectedAt: new Date(snapshot.lastConnectedAt) } : {}),
        ...(snapshot.lastReading ? { lastReadingAt: new Date(snapshot.lastReading.timestamp) } : {}),
        ...(usableReading ? { lastWeightKg: usableReading.weightKg, lastQuality: usableReading.quality } : {}),
        ...(usableReading?.source === "HARDWARE"
          ? { lastSource: "HARDWARE" as const }
          : usableReading?.source === "SIMULATOR"
            ? { lastSource: "SIMULATED" as const }
            : {}),
      },
    });
  } catch (error) {
    console.error("Failed to persist hardware status", {
      weighbridgeId: snapshot.weighbridgeId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
