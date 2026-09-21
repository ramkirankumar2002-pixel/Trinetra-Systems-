import { MaintenanceStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { deriveWeighbridgeStatus, type WeighbridgeOperationalStatus } from "../../domain/weighbridgeStatus.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessWeighbridge } from "../../middleware/authorize.js";
import { getAnprReader } from "../../integrations/anpr/index.js";
import { getConnectionManager, getWeighbridgeReader } from "../../integrations/weighbridge/index.js";
import type { ActorContext } from "../shared/actor.js";

export type PublicWeighbridge = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  operationalStatus: WeighbridgeOperationalStatus;
  site: { id: string; code: string; name: string };
  hardware: {
    providerType: string;
    status: string;
    enabled: boolean;
    healthy: boolean;
    lastWeightKg: string | null;
    lastQuality: string | null;
  } | null;
  camera: {
    id: string;
    name: string;
    purpose: string;
    status: string;
    enabled: boolean;
    anprStatus: string;
    simulated: boolean;
  } | null;
};

export async function listWeighbridges(actor: ActorContext): Promise<{ items: PublicWeighbridge[] }> {
  const rows = await prisma.weighbridge.findMany({
    where: { organizationId: actor.user.organizationId },
    include: {
      site: { select: { id: true, code: true, name: true } },
      hardwareProfile: true,
      cameras: { where: { purpose: "ENTRY_ANPR" }, orderBy: { name: "asc" }, take: 1 },
    },
    orderBy: [{ site: { name: "asc" } }, { code: "asc" }],
  });

  const visible = rows.filter((row) => canAccessWeighbridge(actor.user, row.id, row.siteId));
  const items = await Promise.all(visible.map((row) => toPublicWeighbridge(row)));
  return { items };
}

export async function getAccessibleWeighbridge(actor: ActorContext, weighbridgeId: string) {
  const weighbridge = await prisma.weighbridge.findFirst({
    where: {
      id: weighbridgeId,
      organizationId: actor.user.organizationId,
    },
    include: {
      site: { select: { id: true, code: true, name: true } },
      hardwareProfile: true,
      cameras: { where: { purpose: "ENTRY_ANPR" }, orderBy: { name: "asc" }, take: 1 },
    },
  });

  if (!weighbridge) {
    throw new HttpError(404, "Weighbridge not found");
  }

  if (!canAccessWeighbridge(actor.user, weighbridge.id, weighbridge.siteId)) {
    throw new HttpError(403, "You do not have access to this weighbridge");
  }

  return weighbridge;
}

export async function simulateAnprRead(actor: ActorContext, weighbridgeId: string) {
  await getAccessibleWeighbridge(actor, weighbridgeId);
  return getAnprReader().readPlate({ weighbridgeId });
}

export async function simulateWeightRead(actor: ActorContext, weighbridgeId: string) {
  const weighbridge = await getAccessibleWeighbridge(actor, weighbridgeId);
  if (!weighbridge.isActive) {
    throw new HttpError(400, "This weighbridge is offline");
  }

  return getWeighbridgeReader().readWeight(weighbridgeId);
}

async function toPublicWeighbridge(row: {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  siteId: string;
  site: { id: string; code: string; name: string };
  hardwareProfile?: {
    providerType: string;
    enabled: boolean;
    lastStatus: string;
    lastWeightKg: { toString(): string } | null;
    lastQuality: string | null;
  } | null;
  cameras?: Array<{
    id: string;
    name: string;
    purpose: string;
    enabled: boolean;
    lastStatus: string;
    lastAnprStatus: string;
    cameraProviderType: string;
  }>;
}): Promise<PublicWeighbridge> {
  const [maintenance, openCount] = await Promise.all([
    prisma.maintenanceEvent.findFirst({
      where: {
        weighbridgeId: row.id,
        status: MaintenanceStatus.ACTIVE,
      },
      select: { id: true },
    }),
    prisma.transaction.count({
      where: {
        weighbridgeId: row.id,
        status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] },
      },
    }),
  ]);

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    operationalStatus: deriveWeighbridgeStatus({
      isActive: row.isActive,
      hasActiveMaintenance: maintenance !== null,
      hasOpenTransaction: openCount > 0,
    }),
    site: row.site,
    hardware: hardwareSummary(row.id, row.hardwareProfile ?? null),
    camera: cameraSummary(row.cameras?.[0] ?? null),
  };
}

function cameraSummary(
  camera: {
    id: string;
    name: string;
    purpose: string;
    enabled: boolean;
    lastStatus: string;
    lastAnprStatus: string;
    cameraProviderType: string;
  } | null,
): PublicWeighbridge["camera"] {
  if (!camera) {
    return null;
  }
  return {
    id: camera.id,
    name: camera.name,
    purpose: camera.purpose,
    status: camera.lastStatus,
    enabled: camera.enabled,
    anprStatus: camera.lastAnprStatus,
    simulated: camera.cameraProviderType === "SIMULATOR",
  };
}

function hardwareSummary(
  weighbridgeId: string,
  profile: {
    providerType: string;
    enabled: boolean;
    lastStatus: string;
    lastWeightKg: { toString(): string } | null;
    lastQuality: string | null;
  } | null,
): PublicWeighbridge["hardware"] {
  const live = getConnectionManager().getSnapshot(weighbridgeId);
  if (!profile && !live) {
    return null;
  }
  return {
    providerType: live?.providerType ?? profile?.providerType ?? "SIMULATOR",
    status: live?.status ?? profile?.lastStatus ?? "DISCONNECTED",
    enabled: live?.enabled ?? profile?.enabled ?? false,
    healthy: live?.health.healthy ?? false,
    lastWeightKg: live?.lastReading?.weightKg ?? profile?.lastWeightKg?.toString() ?? null,
    lastQuality: live?.lastReading?.quality ?? profile?.lastQuality ?? null,
  };
}
