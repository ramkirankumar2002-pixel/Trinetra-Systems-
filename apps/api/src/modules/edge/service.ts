import {
  EdgeDeviceType,
  EdgeGatewayStatus,
  HardwareDeviceStatus,
  HardwareInstallationStatus,
  Prisma,
} from "@prisma/client";
import { isHardwareInstallationStatus } from "../../domain/hardwareInstallation.js";
import { resolveProtocolReadiness } from "../../domain/protocolReadiness.js";
import { env } from "../../config/env.js";
import { generateGatewayCredential, hashGatewayCredential } from "../../domain/edgeCredentials.js";
import { deriveGatewayRuntimeStatus, isGatewayAcceptingEvents } from "../../domain/edgeGatewayStatus.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { emitEdgeDeviceUnhealthy, emitGatewayOffline } from "./alerts.js";
import { toPublicDevice, toPublicGateway } from "./mapper.js";
import type { PublicEdgeDevice, PublicEdgeGateway } from "./types.js";
import type { CreateDeviceInput, CreateGatewayInput, HeartbeatInput, UpdateDeviceInput } from "./validators.js";
import { persistSyncSnapshot } from "../sync/snapshot.js";
import { parseSnapshot } from "../sync/validators.js";
import { buildEdgeConfigCache } from "../sync/configCache.js";

const gatewayInclude = {
  site: { select: { id: true, code: true, name: true } },
} as const;

export async function listGateways(
  actor: ActorContext,
): Promise<{ items: Array<PublicEdgeGateway & { devices: PublicEdgeDevice[] }> }> {
  const rows = await prisma.edgeGateway.findMany({
    where: { organizationId: actor.user.organizationId },
    include: { ...gatewayInclude, devices: { orderBy: { code: "asc" } } },
    orderBy: { code: "asc" },
  });
  const nowMs = Date.now();
  const items = [];
  for (const row of rows) {
    if (!canAccessSite(actor.user, row.siteId)) {
      continue;
    }
    const publicGateway = await persistDerivedStatus(row, nowMs);
    items.push({
      ...publicGateway,
      devices: row.devices.map(toPublicDevice),
    });
  }
  return { items };
}

export async function getGateway(
  actor: ActorContext,
  gatewayId: string,
): Promise<PublicEdgeGateway & { devices: PublicEdgeDevice[] }> {
  const row = await loadGateway(actor, gatewayId);
  const devices = await prisma.edgeDevice.findMany({
    where: { gatewayId: row.id },
    orderBy: { code: "asc" },
  });
  return {
    ...(await persistDerivedStatus(row, Date.now())),
    devices: devices.map(toPublicDevice),
  };
}

export async function createGateway(
  actor: ActorContext,
  input: CreateGatewayInput,
): Promise<{ gateway: PublicEdgeGateway; credential: string }> {
  if (!canAccessSite(actor.user, input.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  const site = await prisma.site.findFirst({
    where: { id: input.siteId, organizationId: actor.user.organizationId, deletedAt: null },
  });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }

  const credential = generateGatewayCredential();
  const created = await prisma.edgeGateway.create({
    data: {
      organizationId: actor.user.organizationId,
      siteId: site.id,
      code: input.code,
      name: input.name,
      status: EdgeGatewayStatus.PENDING,
      enabled: true,
      credentialHash: hashGatewayCredential(credential),
      registeredByUserId: actor.user.id,
    },
    include: gatewayInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.GATEWAY_REGISTERED,
    entityType: "EdgeGateway",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { code: created.code, siteId: created.siteId },
  });

  return {
    gateway: toPublicGateway(created, Date.now(), env.gatewayOfflineTimeoutMs),
    credential,
  };
}

export async function rotateGatewayCredential(
  actor: ActorContext,
  gatewayId: string,
): Promise<{ gateway: PublicEdgeGateway; credential: string }> {
  const gateway = await loadGateway(actor, gatewayId);
  if (gateway.revokedAt !== null) {
    throw new HttpError(409, "A revoked gateway cannot receive a new credential");
  }
  const credential = generateGatewayCredential();
  const updated = await prisma.edgeGateway.update({
    where: { id: gateway.id },
    data: { credentialHash: hashGatewayCredential(credential) },
    include: gatewayInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.GATEWAY_CREDENTIAL_ISSUED,
    entityType: "EdgeGateway",
    entityId: gateway.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { rotated: true },
  });
  return {
    gateway: toPublicGateway(updated, Date.now(), env.gatewayOfflineTimeoutMs),
    credential,
  };
}

export async function setGatewayEnabled(
  actor: ActorContext,
  gatewayId: string,
  enabled: boolean,
): Promise<PublicEdgeGateway> {
  const gateway = await loadGateway(actor, gatewayId);
  if (gateway.revokedAt !== null) {
    throw new HttpError(409, "A revoked gateway cannot be enabled");
  }
  const updated = await prisma.edgeGateway.update({
    where: { id: gateway.id },
    data: {
      enabled,
      status: enabled ? EdgeGatewayStatus.PENDING : EdgeGatewayStatus.DISABLED,
    },
    include: gatewayInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: enabled ? AUDIT_ACTIONS.GATEWAY_ENABLED : AUDIT_ACTIONS.GATEWAY_DISABLED,
    entityType: "EdgeGateway",
    entityId: gateway.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return toPublicGateway(updated, Date.now(), env.gatewayOfflineTimeoutMs);
}

export async function revokeGateway(actor: ActorContext, gatewayId: string): Promise<PublicEdgeGateway> {
  const gateway = await loadGateway(actor, gatewayId);
  const updated = await prisma.edgeGateway.update({
    where: { id: gateway.id },
    data: {
      enabled: false,
      revokedAt: new Date(),
      status: EdgeGatewayStatus.REVOKED,
      credentialHash: hashGatewayCredential(generateGatewayCredential()),
    },
    include: gatewayInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.GATEWAY_REVOKED,
    entityType: "EdgeGateway",
    entityId: gateway.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return toPublicGateway(updated, Date.now(), env.gatewayOfflineTimeoutMs);
}

export async function createDevice(
  actor: ActorContext,
  gatewayId: string,
  input: CreateDeviceInput,
): Promise<PublicEdgeDevice> {
  const gateway = await loadGateway(actor, gatewayId);
  await assertLinkedHardware(actor, gateway.siteId, input);
  const created = await prisma.edgeDevice.create({
    data: {
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      deviceType: input.deviceType,
      code: input.code,
      name: input.name,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      serialNumber: input.serialNumber ?? null,
      protocol: input.protocol ?? null,
      connectionType: input.connectionType ?? null,
      provider: input.provider ?? "SIMULATOR",
      weighbridgeId: input.weighbridgeId ?? null,
      cameraId: input.cameraId ?? null,
      enabled: input.enabled ?? true,
      firmwareVersion: input.firmwareVersion ?? null,
      notes: input.notes ?? null,
      host: input.host ?? null,
      port: input.port ?? null,
      serialPort: input.serialPort ?? null,
      adapterKey: input.adapterKey ?? null,
      protocolReadiness: resolveProtocolReadiness({
        provider: input.provider,
        manufacturer: input.manufacturer,
        model: input.model,
        protocol: input.protocol,
        requested: input.protocolReadiness,
      }),
      installationStatus:
        input.installationStatus && isHardwareInstallationStatus(input.installationStatus)
          ? (input.installationStatus as HardwareInstallationStatus)
          : HardwareInstallationStatus.PLANNED,
      ...(input.configurationRef === undefined
        ? {}
        : { configurationRef: input.configurationRef as Prisma.InputJsonValue }),
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.EDGE_DEVICE_CREATED,
    entityType: "EdgeDevice",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { gatewayId: gateway.id, code: created.code, deviceType: created.deviceType },
  });
  return toPublicDevice(created);
}

export async function updateDevice(
  actor: ActorContext,
  gatewayId: string,
  deviceId: string,
  input: UpdateDeviceInput,
): Promise<PublicEdgeDevice> {
  const device = await loadDevice(actor, gatewayId, deviceId);
  await assertLinkedHardware(actor, device.siteId, input);
  const updated = await prisma.edgeDevice.update({
    where: { id: device.id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...(input.connectionType === undefined ? {} : { connectionType: input.connectionType }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.weighbridgeId === undefined ? {} : { weighbridgeId: input.weighbridgeId }),
      ...(input.cameraId === undefined ? {} : { cameraId: input.cameraId }),
      ...(input.enabled === undefined
        ? {}
        : { enabled: input.enabled, status: input.enabled ? device.status : HardwareDeviceStatus.DISABLED }),
      ...(input.configurationRef === undefined
        ? {}
        : {
            configurationRef:
              input.configurationRef === null
                ? Prisma.JsonNull
                : (input.configurationRef as Prisma.InputJsonValue),
          }),
      ...(input.firmwareVersion === undefined ? {} : { firmwareVersion: input.firmwareVersion }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.host === undefined ? {} : { host: input.host }),
      ...(input.port === undefined ? {} : { port: input.port }),
      ...(input.serialPort === undefined ? {} : { serialPort: input.serialPort }),
      ...(input.adapterKey === undefined ? {} : { adapterKey: input.adapterKey }),
      ...(input.protocolReadiness === undefined
        ? {}
        : {
            protocolReadiness: resolveProtocolReadiness({
              provider: input.provider ?? device.provider,
              manufacturer: input.manufacturer === undefined ? device.manufacturer : input.manufacturer,
              model: input.model === undefined ? device.model : input.model,
              protocol: input.protocol === undefined ? device.protocol : input.protocol,
              requested: input.protocolReadiness,
            }),
          }),
      ...(input.installationStatus === undefined || !isHardwareInstallationStatus(input.installationStatus)
        ? {}
        : { installationStatus: input.installationStatus as HardwareInstallationStatus }),
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action:
      input.enabled === false
        ? AUDIT_ACTIONS.EDGE_DEVICE_DISABLED
        : input.enabled === true
          ? AUDIT_ACTIONS.EDGE_DEVICE_ENABLED
          : AUDIT_ACTIONS.EDGE_DEVICE_UPDATED,
    entityType: "EdgeDevice",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return toPublicDevice(updated);
}

export async function testDeviceCommunication(
  actor: ActorContext,
  gatewayId: string,
  deviceId: string,
): Promise<{ ok: boolean; message: string; device: PublicEdgeDevice }> {
  const device = await loadDevice(actor, gatewayId, deviceId);
  if (!device.enabled) {
    return { ok: false, message: "Device is disabled", device: toPublicDevice(device) };
  }
  const last = device.lastCommunicationAt?.getTime() ?? 0;
  const fresh = Date.now() - last <= env.gatewayOfflineTimeoutMs * 2;
  return {
    ok: fresh && device.status === HardwareDeviceStatus.CONNECTED,
    message: fresh
      ? "Last communication is within the health window"
      : "No recent communication from this device",
    device: toPublicDevice(device),
  };
}

export async function recordHeartbeat(
  gatewayId: string,
  organizationId: string,
  input: HeartbeatInput,
): Promise<PublicEdgeGateway> {
  const gateway = await prisma.edgeGateway.findFirst({
    where: { id: gatewayId, organizationId },
    include: gatewayInclude,
  });
  if (!gateway) {
    throw new HttpError(404, "Gateway not found");
  }
  if (!isGatewayAcceptingEvents(gateway.status) && gateway.revokedAt !== null) {
    throw new HttpError(403, "Gateway is revoked or disabled");
  }

  const now = new Date();
  const updated = await prisma.edgeGateway.update({
    where: { id: gateway.id },
    data: {
      status: EdgeGatewayStatus.ONLINE,
      lastHeartbeatAt: now,
      lastCommunicationAt: now,
      lastError: null,
      softwareVersion: input.softwareVersion,
      buildEnvironment: input.buildEnvironment,
      platform: input.platform,
      connectedDeviceCount: input.connectedDeviceCount,
    },
    include: gatewayInclude,
  });

  for (const reported of input.devices) {
    const existing = await prisma.edgeDevice.findFirst({
      where: { id: reported.deviceId, gatewayId: gateway.id },
    });
    if (!existing) {
      continue;
    }
    const becameUnhealthy =
      existing.status === HardwareDeviceStatus.CONNECTED &&
      (reported.status === HardwareDeviceStatus.DISCONNECTED ||
        reported.status === HardwareDeviceStatus.ERROR);
    await prisma.edgeDevice.update({
      where: { id: existing.id },
      data: {
        status: existing.enabled ? reported.status : HardwareDeviceStatus.DISABLED,
        lastCommunicationAt: reported.lastCommunicationAt
          ? new Date(reported.lastCommunicationAt)
          : now,
        lastError: reported.lastError,
        ...(reported.lastReadingSummary === undefined
          ? {}
          : { lastReadingSummary: reported.lastReadingSummary as Prisma.InputJsonValue }),
        ...(reported.lastDiagnostic === undefined
          ? {}
          : { lastDiagnostic: reported.lastDiagnostic as Prisma.InputJsonValue }),
      },
    });
    if (becameUnhealthy) {
      emitEdgeDeviceUnhealthy({
        organizationId: gateway.organizationId,
        siteId: gateway.siteId,
        gatewayId: gateway.id,
        deviceId: existing.id,
        deviceName: existing.name,
        status: reported.status,
        lastError: reported.lastError,
        incidentKey: hourKey(),
      });
    }
  }

  if (input.snapshot) {
    await persistSyncSnapshot(
      {
        id: updated.id,
        organizationId: updated.organizationId,
        siteId: updated.siteId,
        code: updated.code,
      },
      parseSnapshot(input.snapshot),
    );
  }

  return toPublicGateway(updated, Date.now(), env.gatewayOfflineTimeoutMs);
}

export async function bootstrapGateway(gatewayId: string, organizationId: string) {
  const gateway = await prisma.edgeGateway.findFirst({
    where: { id: gatewayId, organizationId },
    include: { ...gatewayInclude, devices: { orderBy: { code: "asc" } } },
  });
  if (!gateway) {
    throw new HttpError(404, "Gateway not found");
  }
  const config = await buildEdgeConfigCache(gatewayId, organizationId);
  if (!config) {
    throw new HttpError(500, "Unable to build the Edge configuration cache");
  }
  return {
    gateway: toPublicGateway(gateway, Date.now(), env.gatewayOfflineTimeoutMs),
    devices: gateway.devices.map(toPublicDevice),
    config,
  };
}

async function persistDerivedStatus(
  row: Prisma.EdgeGatewayGetPayload<{ include: typeof gatewayInclude }>,
  nowMs: number,
): Promise<PublicEdgeGateway> {
  const derived = deriveGatewayRuntimeStatus({
    enabled: row.enabled,
    revokedAt: row.revokedAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
    nowMs,
    offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
  });
  if (derived === "OFFLINE" && row.status === EdgeGatewayStatus.ONLINE) {
    await prisma.edgeGateway.update({
      where: { id: row.id },
      data: { status: EdgeGatewayStatus.OFFLINE },
    });
    emitGatewayOffline({
      organizationId: row.organizationId,
      siteId: row.siteId,
      gatewayId: row.id,
      gatewayCode: row.code,
      incidentKey: hourKey(),
    });
    row.status = EdgeGatewayStatus.OFFLINE;
  }
  return toPublicGateway(row, nowMs, env.gatewayOfflineTimeoutMs);
}

async function loadGateway(actor: ActorContext, gatewayId: string) {
  const gateway = await prisma.edgeGateway.findFirst({
    where: { id: gatewayId, organizationId: actor.user.organizationId },
    include: gatewayInclude,
  });
  if (!gateway) {
    throw new HttpError(404, "Gateway not found");
  }
  if (!canAccessSite(actor.user, gateway.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  return gateway;
}

async function loadDevice(actor: ActorContext, gatewayId: string, deviceId: string) {
  await loadGateway(actor, gatewayId);
  const device = await prisma.edgeDevice.findFirst({
    where: { id: deviceId, gatewayId, organizationId: actor.user.organizationId },
  });
  if (!device) {
    throw new HttpError(404, "Device not found");
  }
  return device;
}

async function assertLinkedHardware(
  actor: ActorContext,
  siteId: string,
  input: { weighbridgeId?: string | null | undefined; cameraId?: string | null | undefined },
): Promise<void> {
  if (input.weighbridgeId) {
    const weighbridge = await prisma.weighbridge.findFirst({
      where: { id: input.weighbridgeId, organizationId: actor.user.organizationId, siteId },
    });
    if (!weighbridge) {
      throw new HttpError(400, "Weighbridge is not on this gateway site");
    }
  }
  if (input.cameraId) {
    const camera = await prisma.camera.findFirst({
      where: { id: input.cameraId, organizationId: actor.user.organizationId, siteId },
    });
    if (!camera) {
      throw new HttpError(400, "Camera is not on this gateway site");
    }
  }
}

function hourKey(): string {
  return new Date().toISOString().slice(0, 13);
}

export const DEMO_DEVICE_TYPES = {
  WB: EdgeDeviceType.WEIGHBRIDGE_INDICATOR,
  CAM: EdgeDeviceType.CAMERA,
  SCAN: EdgeDeviceType.SCANNER,
} as const;
