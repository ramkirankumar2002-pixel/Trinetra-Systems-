import { createHash } from "node:crypto";
import { DEFAULT_OFFLINE_POLICY } from "../../domain/offlinePolicy.js";
import { toConfigValues } from "../../domain/weightAnomaly/config.js";
import { prisma } from "../../db/client.js";
import { toPublicDevice, toPublicGateway } from "../edge/mapper.js";
import { env } from "../../config/env.js";

export async function buildEdgeConfigCache(gatewayId: string, organizationId: string) {
  const gateway = await prisma.edgeGateway.findFirst({
    where: { id: gatewayId, organizationId },
    include: {
      site: { select: { id: true, code: true, name: true, timezone: true } },
      devices: { orderBy: { code: "asc" } },
    },
  });
  if (!gateway) {
    return null;
  }

  const [policy, weighbridges, anomalyConfigs, vehicles] = await Promise.all([
    prisma.offlinePolicy.findUnique({
      where: { organizationId_siteId: { organizationId, siteId: gateway.siteId } },
    }),
    prisma.weighbridge.findMany({
      where: { organizationId, siteId: gateway.siteId, isActive: true },
      select: { id: true, code: true, name: true, siteId: true },
      take: 20,
    }),
    prisma.weightAnomalyConfig.findMany({
      where: { organizationId, weighbridge: { siteId: gateway.siteId } },
    }),
    prisma.vehicle.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        registrationNumber: true,
        displayRegistrationNumber: true,
      },
      take: 200,
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const now = new Date();
  const maxAgeHours = policy?.maxConfigAgeHours ?? DEFAULT_OFFLINE_POLICY.maxConfigAgeHours;
  const validUntil = new Date(now.getTime() + maxAgeHours * 60 * 60 * 1000).toISOString();
  const policyValues = {
    version: policy?.version ?? DEFAULT_OFFLINE_POLICY.version,
    source: policy?.source ?? "CENTRAL",
    timestamp: now.toISOString(),
    validUntil,
    allowWeightRead: policy?.allowWeightRead ?? true,
    allowAnpr: policy?.allowAnpr ?? true,
    allowDocumentCapture: policy?.allowDocumentCapture ?? true,
    allowBasicTransactionRecording: policy?.allowBasicTransactionRecording ?? true,
    allowWeightAnomalyDetection: policy?.allowWeightAnomalyDetection ?? true,
    transactionCompletion: policy?.transactionCompletion ?? "CONDITIONAL",
    materialVerification: policy?.materialVerification ?? "CONDITIONAL",
    approvals: policy?.approvals ?? "BLOCKED",
    configChanges: policy?.configChanges ?? "BLOCKED",
    userManagement: policy?.userManagement ?? "BLOCKED",
    hardwareConfigChanges: policy?.hardwareConfigChanges ?? "BLOCKED",
    maxConfigAgeHours: maxAgeHours,
  };
  const version = createHash("sha256")
    .update(JSON.stringify({ gatewayId, policy: policyValues.version, weighbridges, anomalyConfigs: anomalyConfigs.length }))
    .digest("hex")
    .slice(0, 24);

  return {
    version,
    timestamp: now.toISOString(),
    source: "CENTRAL" as const,
    validUntil,
    gateway: toPublicGateway(gateway, Date.now(), env.gatewayOfflineTimeoutMs),
    devices: gateway.devices.map(toPublicDevice),
    weighbridges,
    anomalyConfigs: anomalyConfigs.map((row) => ({
      weighbridgeId: row.weighbridgeId,
      ...toConfigValues(row),
    })),
    policy: policyValues,
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      normalizedPlateNumber: vehicle.registrationNumber,
      displayRegistrationNumber: vehicle.displayRegistrationNumber,
    })),
  };
}
