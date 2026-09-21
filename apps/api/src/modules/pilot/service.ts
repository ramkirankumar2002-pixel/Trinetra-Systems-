import { CommissioningTestResult, EdgeDeviceType } from "@prisma/client";
import { commissioningItemsForDeviceType, GATEWAY_COMMISSIONING_ITEMS } from "../../domain/commissioningChecklist.js";
import { env } from "../../config/env.js";
import { projectHardwareDiscoveryReport } from "../../domain/hardwareDiscovery.js";
import { installationStatusRejection } from "../../domain/hardwareInstallation.js";
import { METROLOGY_NOTICE } from "../../domain/metrologyBoundary.js";
import { HARDWARE_INFORMATION_REQUIRED_MESSAGE, resolveProtocolReadiness } from "../../domain/protocolReadiness.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicCommissioningTest, toPublicInventoryDevice } from "./mapper.js";
import type { PublicPilotOverview } from "./types.js";
import type { RecordCommissioningInput, UpdateInventoryInput, UpdateSiteModeInput } from "./validators.js";

const deviceInclude = {
  site: { select: { id: true, code: true, name: true, operationMode: true } },
  weighbridge: { select: { id: true, code: true, name: true } },
  gateway: { select: { id: true, code: true, name: true, status: true, softwareVersion: true, lastHeartbeatAt: true } },
} as const;

export async function getPilotOverview(actor: ActorContext): Promise<PublicPilotOverview> {
  const sites = await prisma.site.findMany({
    where: { organizationId: actor.user.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, operationMode: true },
    orderBy: { code: "asc" },
  });
  const visibleSites = sites.filter((site) => canAccessSite(actor.user, site.id));

  const gateways = await prisma.edgeGateway.findMany({
    where: { organizationId: actor.user.organizationId, siteId: { in: visibleSites.map((site) => site.id) } },
    include: { site: { select: { id: true, code: true, name: true } } },
    orderBy: { code: "asc" },
  });

  const devices = await prisma.edgeDevice.findMany({
    where: { organizationId: actor.user.organizationId, siteId: { in: visibleSites.map((site) => site.id) } },
    include: deviceInclude,
    orderBy: { code: "asc" },
  });

  await ensureCommissioningRows(actor.user.organizationId, devices);

  const tests = await prisma.hardwareCommissioningTest.findMany({
    where: { organizationId: actor.user.organizationId, siteId: { in: visibleSites.map((site) => site.id) } },
    include: { testedBy: { select: { id: true, fullName: true } } },
    orderBy: [{ testType: "asc" }, { testKey: "asc" }],
  });

  const nowMs = Date.now();
  return {
    operationModes: ["SIMULATION", "PILOT", "PRODUCTION"],
    sites: visibleSites,
    gateways: gateways.map((gateway) => ({
      id: gateway.id,
      code: gateway.code,
      name: gateway.name,
      status: deriveGatewayRuntimeStatus({
        enabled: gateway.enabled,
        revokedAt: gateway.revokedAt,
        lastHeartbeatAt: gateway.lastHeartbeatAt,
        nowMs,
        offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
      }),
      site: gateway.site,
      softwareVersion: gateway.softwareVersion,
      lastHeartbeatAt: gateway.lastHeartbeatAt?.toISOString() ?? null,
      connectedDeviceCount: gateway.connectedDeviceCount,
    })),
    devices: devices.map(toPublicInventoryDevice),
    commissioning: tests.map(toPublicCommissioningTest),
    metrologyNotice: METROLOGY_NOTICE,
    realAdaptersFinalized: false,
    hardwareInformationRequired: HARDWARE_INFORMATION_REQUIRED_MESSAGE,
    discovery: projectHardwareDiscoveryReport(),
    unsafeControlsDisabled: true,
  };
}

export async function updateSiteOperationMode(
  actor: ActorContext,
  siteId: string,
  input: UpdateSiteModeInput,
): Promise<{ id: string; code: string; name: string; operationMode: string }> {
  if (!canAccessSite(actor.user, siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: actor.user.organizationId, deletedAt: null },
  });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { operationMode: input.operationMode },
    select: { id: true, code: true, name: true, operationMode: true },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.SITE_OPERATION_MODE_UPDATED,
    entityType: "Site",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { operationMode: updated.operationMode },
  });
  return updated;
}

export async function updateInventoryDevice(
  actor: ActorContext,
  deviceId: string,
  input: UpdateInventoryInput,
) {
  const device = await prisma.edgeDevice.findFirst({
    where: { id: deviceId, organizationId: actor.user.organizationId },
    include: deviceInclude,
  });
  if (!device) {
    throw new HttpError(404, "Device not found");
  }
  if (!canAccessSite(actor.user, device.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const protocolReadiness = resolveProtocolReadiness({
    provider: input.protocolReadiness === undefined ? device.provider : undefined,
    manufacturer: input.manufacturer === undefined ? device.manufacturer : input.manufacturer,
    model: input.model === undefined ? device.model : input.model,
    protocol: input.protocol === undefined ? device.protocol : input.protocol,
    requested: input.protocolReadiness ?? device.protocolReadiness,
  });
  const installationStatus = input.installationStatus ?? device.installationStatus;
  const blocked = installationStatusRejection(installationStatus, protocolReadiness);
  if (blocked) {
    throw new HttpError(400, blocked);
  }

  const updated = await prisma.edgeDevice.update({
    where: { id: device.id },
    data: {
      ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
      ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
      ...(input.connectionType === undefined ? {} : { connectionType: input.connectionType }),
      ...(input.firmwareVersion === undefined ? {} : { firmwareVersion: input.firmwareVersion }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.host === undefined ? {} : { host: input.host }),
      ...(input.port === undefined ? {} : { port: input.port }),
      ...(input.serialPort === undefined ? {} : { serialPort: input.serialPort }),
      ...(input.adapterKey === undefined ? {} : { adapterKey: input.adapterKey }),
      protocolReadiness,
      installationStatus,
      ...(input.enabled === undefined
        ? {}
        : { enabled: input.enabled, status: input.enabled ? device.status : "DISABLED" }),
    },
    include: deviceInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.HARDWARE_INVENTORY_UPDATED,
    entityType: "EdgeDevice",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      protocolReadiness: updated.protocolReadiness,
      installationStatus: updated.installationStatus,
    },
  });

  return toPublicInventoryDevice(updated);
}

export async function recordCommissioningTest(actor: ActorContext, input: RecordCommissioningInput) {
  const items = [...commissioningItemsForDeviceType("WEIGHBRIDGE_INDICATOR"), ...GATEWAY_COMMISSIONING_ITEMS];
  const catalog = items.find((item) => item.testKey === input.testKey);
  const fallback = [...commissioningItemsForDeviceType("CAMERA"), ...commissioningItemsForDeviceType("SCANNER")].find(
    (item) => item.testKey === input.testKey,
  );
  const item = catalog ?? fallback;
  if (!item) {
    throw new HttpError(400, "A valid commissioning test is required");
  }

  let device = input.deviceId
    ? await prisma.edgeDevice.findFirst({
        where: { id: input.deviceId, organizationId: actor.user.organizationId },
      })
    : await prisma.edgeDevice.findFirst({
        where: {
          organizationId: actor.user.organizationId,
          deviceType: { in: item.deviceTypes as EdgeDeviceType[] },
        },
        orderBy: { code: "asc" },
      });

  if (!device && item.group === "EDGE") {
    device = await prisma.edgeDevice.findFirst({
      where: { organizationId: actor.user.organizationId },
      orderBy: { code: "asc" },
    });
  }
  if (!device) {
    throw new HttpError(404, "No matching device is available for this test");
  }
  if (!canAccessSite(actor.user, device.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const testedAt = input.result === CommissioningTestResult.NOT_TESTED ? null : new Date();
  const updated = await prisma.hardwareCommissioningTest.upsert({
    where: { deviceId_testKey: { deviceId: device.id, testKey: input.testKey } },
    update: {
      result: input.result,
      notes: input.notes,
      error: input.error,
      testedAt,
      testedByUserId: input.result === CommissioningTestResult.NOT_TESTED ? null : actor.user.id,
    },
    create: {
      organizationId: device.organizationId,
      siteId: device.siteId,
      deviceId: device.id,
      testKey: input.testKey,
      testType: item.testType,
      result: input.result,
      notes: input.notes,
      error: input.error,
      testedAt,
      testedByUserId: input.result === CommissioningTestResult.NOT_TESTED ? null : actor.user.id,
    },
    include: { testedBy: { select: { id: true, fullName: true } } },
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.COMMISSIONING_TEST_RECORDED,
    entityType: "HardwareCommissioningTest",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { testKey: updated.testKey, result: updated.result, deviceId: device.id },
  });

  return toPublicCommissioningTest(updated);
}

async function ensureCommissioningRows(
  organizationId: string,
  devices: Array<{ id: string; siteId: string; deviceType: string }>,
): Promise<void> {
  for (const device of devices) {
    const items = commissioningItemsForDeviceType(device.deviceType);
    for (const item of items) {
      await prisma.hardwareCommissioningTest.upsert({
        where: { deviceId_testKey: { deviceId: device.id, testKey: item.testKey } },
        update: {},
        create: {
          organizationId,
          siteId: device.siteId,
          deviceId: device.id,
          testKey: item.testKey,
          testType: item.testType,
          result: CommissioningTestResult.NOT_TESTED,
        },
      });
    }
  }

  const firstDevice = devices[0];
  if (!firstDevice) {
    return;
  }
  for (const item of GATEWAY_COMMISSIONING_ITEMS) {
    await prisma.hardwareCommissioningTest.upsert({
      where: { deviceId_testKey: { deviceId: firstDevice.id, testKey: item.testKey } },
      update: {},
      create: {
        organizationId,
        siteId: firstDevice.siteId,
        deviceId: firstDevice.id,
        testKey: item.testKey,
        testType: item.testType,
        result: CommissioningTestResult.NOT_TESTED,
      },
    });
  }
}
