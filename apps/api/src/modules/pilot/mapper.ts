import type { EdgeDevice, EdgeGateway, HardwareCommissioningTest, Site, User, Weighbridge } from "@prisma/client";
import { COMMISSIONING_ITEMS, GATEWAY_COMMISSIONING_ITEMS } from "../../domain/commissioningChecklist.js";
import { toPublicWeightDiagnostic } from "../../domain/hardwarePilotDiagnostics.js";
import { resolveAdapterKey, type HardwareProtocolReadinessValue } from "../../domain/protocolReadiness.js";
import { stripSecretFields } from "../../domain/edgeSecrets.js";
import type { PublicCommissioningTest, PublicHardwareInventoryDevice } from "./types.js";

type InventoryDevice = EdgeDevice & {
  site: Pick<Site, "id" | "code" | "name" | "operationMode">;
  weighbridge: Pick<Weighbridge, "id" | "code" | "name"> | null;
  gateway: Pick<EdgeGateway, "id" | "code" | "name" | "status" | "softwareVersion" | "lastHeartbeatAt">;
};

export function toPublicInventoryDevice(row: InventoryDevice): PublicHardwareInventoryDevice {
  const summary =
    row.lastReadingSummary && typeof row.lastReadingSummary === "object"
      ? (stripSecretFields(row.lastReadingSummary) as Record<string, unknown>)
      : {};
  const diagnostic = toPublicWeightDiagnostic(row.lastDiagnostic) ?? toPublicWeightDiagnostic(row.lastReadingSummary);
  const adapter = resolveAdapterKey({
    adapterKey: row.adapterKey,
    protocolReadiness: row.protocolReadiness as HardwareProtocolReadinessValue,
    provider: row.provider,
  });

  return {
    id: row.id,
    deviceId: row.code,
    deviceType: row.deviceType,
    manufacturer: row.manufacturer,
    model: row.model,
    serialNumber: row.serialNumber,
    site: row.site,
    weighbridge: row.weighbridge,
    connectionType: row.connectionType,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    serialPort: row.serialPort,
    enabled: row.enabled,
    adapter,
    firmwareVersion: row.firmwareVersion,
    notes: row.notes,
    installationStatus: row.installationStatus,
    protocolReadiness: row.protocolReadiness,
    status: row.status,
    lastCommunicationAt: row.lastCommunicationAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastWeightKg: asScalar(summary.weightKg),
    lastStability:
      typeof summary.quality === "string" ? summary.quality : typeof summary.stable === "boolean" ? summary.stable : null,
    lastPlate: typeof summary.plate === "string" ? summary.plate : null,
    lastConfidence: typeof summary.confidence === "number" ? summary.confidence : null,
    lastScan: typeof summary.fileName === "string" ? summary.fileName : null,
    lastFrameAvailable: summary.lastFrameAvailable === true || typeof summary.plate === "string",
    diagnostic,
    lastClockIssue: row.lastClockIssue,
    gateway: {
      id: row.gateway.id,
      code: row.gateway.code,
      name: row.gateway.name,
      status: row.gateway.status,
      softwareVersion: row.gateway.softwareVersion,
      lastHeartbeatAt: row.gateway.lastHeartbeatAt?.toISOString() ?? null,
    },
  };
}

export function toPublicCommissioningTest(
  row: HardwareCommissioningTest & { testedBy: Pick<User, "id" | "fullName"> | null },
): PublicCommissioningTest {
  const catalog = [...COMMISSIONING_ITEMS, ...GATEWAY_COMMISSIONING_ITEMS].find((item) => item.testKey === row.testKey);
  return {
    id: row.id,
    deviceId: row.deviceId,
    testKey: row.testKey,
    testType: row.testType,
    label: catalog?.label ?? row.testKey,
    result: row.result,
    notes: row.notes,
    error: row.error,
    testedAt: row.testedAt?.toISOString() ?? null,
    testedBy: row.testedBy,
  };
}

function asScalar(value: unknown): string | number | null {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return null;
}
