import { Prisma, WeighbridgeProviderType } from "@prisma/client";
import { defaultConnectionType, type HardwareConfigInput } from "../../domain/hardwareConfig.js";
import { prisma } from "../../db/client.js";
import { canAccessWeighbridge } from "../../middleware/authorize.js";
import { emitHardwareConnectionFailed, emitHardwareRecovered } from "../../integrations/weighbridge/alerts.js";
import { getConnectionManager } from "../../integrations/weighbridge/connectionManager.js";
import { toFactoryInput } from "../../integrations/weighbridge/runtime.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { getAccessibleWeighbridge } from "../weighbridges/service.js";
import { toPublicLiveWeight } from "../../domain/normalizedWeight.js";
import {
  publicLiveWeight,
  toConfigInput,
  toPublicHardwareDevice,
  type ProfileRow,
  type PublicHardwareDevice,
} from "./mapper.js";
import { mergeHardwareConfig, parseHardwarePatch, prismaProvider } from "./validators.js";
import { recordWeighbridgeReading } from "../../lib/metrics.js";

const profileInclude = {
  weighbridge: { select: { code: true, name: true, isActive: true } },
  site: { select: { id: true, code: true, name: true } },
} as const;

export async function listHardwareDevices(actor: ActorContext): Promise<{ items: PublicHardwareDevice[] }> {
  const rows = await prisma.weighbridge.findMany({
    where: { organizationId: actor.user.organizationId },
    include: {
      hardwareProfile: { include: profileInclude },
      site: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ site: { name: "asc" } }, { code: "asc" }],
  });

  const items: PublicHardwareDevice[] = [];
  for (const weighbridge of rows) {
    if (!canAccessWeighbridge(actor.user, weighbridge.id, weighbridge.siteId)) {
      continue;
    }
    const profile = weighbridge.hardwareProfile ?? (await ensureProfile(weighbridge));
    items.push(toPublicHardwareDevice(profile as ProfileRow, getConnectionManager().getSnapshot(weighbridge.id)));
  }
  return { items };
}

export async function getHardwareDevice(actor: ActorContext, weighbridgeId: string): Promise<PublicHardwareDevice> {
  const profile = await loadProfile(actor, weighbridgeId);
  return toPublicHardwareDevice(profile, getConnectionManager().getSnapshot(weighbridgeId));
}

export async function updateHardwareDevice(
  actor: ActorContext,
  weighbridgeId: string,
  body: unknown,
): Promise<PublicHardwareDevice> {
  const profile = await loadProfile(actor, weighbridgeId);
  const previousProvider = profile.providerType;
  const merged = mergeHardwareConfig(toConfigInput(profile), parseHardwarePatch(body));
  const updated = await prisma.weighbridgeHardwareProfile.update({
    where: { id: profile.id },
    data: toPersistData(merged),
    include: profileInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action:
      previousProvider !== updated.providerType
        ? AUDIT_ACTIONS.HARDWARE_PROVIDER_CHANGED
        : AUDIT_ACTIONS.HARDWARE_CONFIG_UPDATED,
    entityType: "WeighbridgeHardwareProfile",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      weighbridgeId,
      providerType: updated.providerType,
      enabled: updated.enabled,
    },
  });

  if (updated.enabled) {
    await getConnectionManager().restart(toFactoryInput(updated));
  } else {
    await getConnectionManager().stop(weighbridgeId, "Configuration updated while disabled");
  }

  return toPublicHardwareDevice(updated as ProfileRow, getConnectionManager().getSnapshot(weighbridgeId));
}

export async function setHardwareEnabled(
  actor: ActorContext,
  weighbridgeId: string,
  enabled: boolean,
): Promise<PublicHardwareDevice> {
  const profile = await loadProfile(actor, weighbridgeId);
  const updated = await prisma.weighbridgeHardwareProfile.update({
    where: { id: profile.id },
    data: {
      enabled,
      lastStatus: enabled ? "DISCONNECTED" : "DISABLED",
    },
    include: profileInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: enabled ? AUDIT_ACTIONS.HARDWARE_ENABLED : AUDIT_ACTIONS.HARDWARE_DISABLED,
    entityType: "WeighbridgeHardwareProfile",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { weighbridgeId, enabled },
  });

  if (enabled) {
    const snapshot = await getConnectionManager().restart(toFactoryInput(updated));
    if (snapshot.status === "CONNECTED") {
      emitHardwareRecovered({
        organizationId: updated.organizationId,
        siteId: updated.siteId,
        weighbridgeId,
        deviceName: updated.deviceName,
        incidentKey: `${weighbridgeId}:enable:${Date.now()}`,
        actor,
      });
    }
  } else {
    await getConnectionManager().stop(weighbridgeId, "Device disabled");
  }

  return toPublicHardwareDevice(updated as ProfileRow, getConnectionManager().getSnapshot(weighbridgeId));
}

export async function testHardwareConnection(actor: ActorContext, weighbridgeId: string) {
  const profile = await loadProfile(actor, weighbridgeId);
  const result = await getConnectionManager().test(toFactoryInput({ ...profile, enabled: true }));

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: result.ok ? AUDIT_ACTIONS.HARDWARE_CONNECTION_TESTED : AUDIT_ACTIONS.HARDWARE_CONNECTION_FAILED,
    entityType: "WeighbridgeHardwareProfile",
    entityId: profile.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      weighbridgeId,
      ok: result.ok,
      message: result.message,
    },
  });

  if (!result.ok) {
    emitHardwareConnectionFailed({
      organizationId: profile.organizationId,
      siteId: profile.siteId,
      weighbridgeId,
      deviceName: profile.deviceName,
      incidentKey: `${weighbridgeId}:test:${Date.now()}`,
      message: result.message,
      actor,
    });
  }

  return {
    ok: result.ok,
    message: result.message,
    device: toPublicHardwareDevice(profile, getConnectionManager().getSnapshot(weighbridgeId) ?? result.snapshot),
    reading: result.reading ? toPublicLiveWeight(result.reading) : null,
  };
}

export async function refreshHardwareStatus(actor: ActorContext, weighbridgeId: string): Promise<PublicHardwareDevice> {
  await getConnectionManager().read(weighbridgeId);
  return getHardwareDevice(actor, weighbridgeId);
}

export async function getLiveWeight(actor: ActorContext, weighbridgeId: string) {
  const device = await getHardwareDevice(actor, weighbridgeId);
  let reading = getConnectionManager().getReading(weighbridgeId);
  if (!reading && device.enabled) {
    reading = await getConnectionManager().read(weighbridgeId);
  }
  recordWeighbridgeReading(reading?.quality ?? device.lastQuality);
  return publicLiveWeight(device, reading, getConnectionManager().getSnapshot(weighbridgeId)?.health ?? null);
}

export async function requireOfficialLiveReading(actor: ActorContext, weighbridgeId: string) {
  await getAccessibleWeighbridge(actor, weighbridgeId);
  const live = await getLiveWeight(actor, weighbridgeId);
  return live;
}

async function loadProfile(actor: ActorContext, weighbridgeId: string): Promise<ProfileRow> {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  const existing = await prisma.weighbridgeHardwareProfile.findUnique({
    where: { weighbridgeId },
    include: profileInclude,
  });
  if (existing) {
    return existing as ProfileRow;
  }
  return ensureProfile(weighbridge);
}

async function ensureProfile(weighbridge: {
  id: string;
  organizationId: string;
  siteId: string;
  code: string;
  name: string;
}): Promise<ProfileRow> {
  const created = await prisma.weighbridgeHardwareProfile.create({
    data: {
      organizationId: weighbridge.organizationId,
      siteId: weighbridge.siteId,
      weighbridgeId: weighbridge.id,
      providerType: WeighbridgeProviderType.SIMULATOR,
      connectionType: defaultConnectionType("SIMULATOR"),
      deviceName: weighbridge.name,
      deviceIdentifier: weighbridge.code,
      enabled: true,
      unit: "KG",
      simulatorMode: "AUTO",
      stabilityDurationMs: 1000,
      stabilityConsecutive: 3,
      pollingIntervalMs: 500,
    },
    include: profileInclude,
  });

  await writeAudit({
    organizationId: weighbridge.organizationId,
    action: AUDIT_ACTIONS.HARDWARE_DEVICE_CREATED,
    entityType: "WeighbridgeHardwareProfile",
    entityId: created.id,
    metadata: { weighbridgeId: weighbridge.id, providerType: "SIMULATOR" },
  });

  return created as ProfileRow;
}

function toPersistData(config: HardwareConfigInput): Prisma.WeighbridgeHardwareProfileUpdateInput {
  return {
    providerType: prismaProvider(config.providerType),
    connectionType: config.connectionType,
    deviceName: config.deviceName,
    deviceIdentifier: config.deviceIdentifier,
    enabled: config.enabled,
    unit: config.unit,
    pollingIntervalMs: config.pollingIntervalMs,
    connectionTimeoutMs: config.connectionTimeoutMs,
    healthTimeoutMs: config.healthTimeoutMs,
    reconnectEnabled: config.reconnectEnabled,
    reconnectDelayMs: config.reconnectDelayMs,
    maxReconnectAttempts: config.maxReconnectAttempts,
    stabilityToleranceKg: config.stabilityToleranceKg,
    stabilityConsecutive: config.stabilityConsecutive,
    stabilityDurationMs: config.stabilityDurationMs,
    host: config.host ?? null,
    port: config.port ?? null,
    serialPort: config.serialPort ?? null,
    baudRate: config.baudRate ?? null,
    dataBits: config.dataBits ?? null,
    stopBits: config.stopBits ?? null,
    parity: config.parity ?? null,
    protocol: config.protocol ?? null,
    modbusMapping: config.modbusMapping === undefined ? Prisma.JsonNull : (config.modbusMapping as Prisma.InputJsonValue),
    simulatorMode: config.simulatorMode,
    simulatorBaseKg: config.simulatorBaseKg ?? null,
  };
}
