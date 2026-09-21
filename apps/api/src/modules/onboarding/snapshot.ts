import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { isDriverLocale } from "../../domain/driverConfig.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import {
  ONBOARDING_STEP_KEYS,
  REQUIRED_OPERATIONAL_PERMISSIONS,
  type OnboardingStepKey,
} from "../../domain/onboarding/catalog.js";
import type { OnboardingValidationSnapshot } from "../../domain/onboarding/validation.js";
import { prisma } from "../../db/client.js";
import type { ActorContext } from "../shared/actor.js";

export type SessionSettings = {
  selectedDepartmentIds: string[];
  documentTypeCodes: string[];
  notificationRecipientUserIds: string[];
};

export function parseSessionSettings(value: unknown): SessionSettings {
  if (typeof value !== "object" || value === null) {
    return { selectedDepartmentIds: [], documentTypeCodes: [], notificationRecipientUserIds: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    selectedDepartmentIds: stringList(record.selectedDepartmentIds),
    documentTypeCodes: stringList(record.documentTypeCodes),
    notificationRecipientUserIds: stringList(record.notificationRecipientUserIds),
  };
}

export function settingsToJson(settings: SessionSettings): Prisma.InputJsonValue {
  return {
    selectedDepartmentIds: settings.selectedDepartmentIds,
    documentTypeCodes: settings.documentTypeCodes,
    notificationRecipientUserIds: settings.notificationRecipientUserIds,
  };
}

export async function loadValidationSnapshot(
  actor: ActorContext,
  input: { organizationId: string; siteId: string | null; settings: SessionSettings; hardwareCheck: unknown },
): Promise<OnboardingValidationSnapshot> {
  const organization = await prisma.organization.findUnique({
    where: { id: input.organizationId },
  });
  const site = input.siteId
    ? await prisma.site.findFirst({
        where: { id: input.siteId, organizationId: input.organizationId, deletedAt: null },
      })
    : null;

  const [
    users,
    permissionRows,
    weighbridges,
    gateways,
    devices,
    cameras,
    materials,
    workflows,
    unloadingPoints,
    offlinePolicy,
    backupCount,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: input.organizationId, deletedAt: null },
      include: { userRoles: { include: { role: { select: { code: true } } } } },
    }),
    prisma.rolePermission.findMany({
      where: { role: { organizationId: input.organizationId } },
      include: { permission: { select: { code: true } } },
    }),
    prisma.weighbridge.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.siteId ? { siteId: input.siteId } : {}),
      },
    }),
    prisma.edgeGateway.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.siteId ? { siteId: input.siteId } : {}),
      },
    }),
    prisma.edgeDevice.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.siteId ? { siteId: input.siteId } : {}),
      },
    }),
    prisma.camera.findMany({
      where: {
        organizationId: input.organizationId,
        ...(input.siteId ? { siteId: input.siteId } : {}),
      },
    }),
    prisma.material.findMany({
      where: { organizationId: input.organizationId, deletedAt: null },
      include: {
        assignments: {
          where: { effectiveTo: null },
          include: { workflowDefinition: { select: { isActive: true } } },
        },
      },
    }),
    prisma.workflowDefinition.findMany({
      where: { organizationId: input.organizationId },
      include: { steps: true },
    }),
    prisma.unloadingPoint.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        isActive: true,
        ...(input.siteId ? { siteId: input.siteId } : {}),
      },
    }),
    input.siteId
      ? prisma.offlinePolicy.findUnique({
          where: {
            organizationId_siteId: { organizationId: input.organizationId, siteId: input.siteId },
          },
        })
      : Promise.resolve(null),
    prisma.backupRun.count(),
  ]);

  const permissionCodes = new Set(permissionRows.map((row) => row.permission.code));
  const missingPermissions = REQUIRED_OPERATIONAL_PERMISSIONS.filter((code) => !permissionCodes.has(code));
  const hardware = readHardwareCheck(input.hardwareCheck);
  const nowMs = Date.now();
  const connectedGateway = gateways.find((gateway) => {
    const status = deriveGatewayRuntimeStatus({
      enabled: gateway.enabled,
      revokedAt: gateway.revokedAt,
      lastHeartbeatAt: gateway.lastHeartbeatAt,
      nowMs,
      offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
    });
    return status === "ONLINE";
  });
  const documentCodes =
    organization && organization.documentTypeCodes.length > 0
      ? organization.documentTypeCodes
      : input.settings.documentTypeCodes;

  return {
    organization: {
      exists: organization !== null,
      active: organization?.status === "ACTIVE",
      name: organization?.name ?? "",
    },
    site: {
      exists: site !== null,
      active: site?.status === "ACTIVE",
      name: site?.name ?? "",
    },
    users: {
      administratorExists: users.some(
        (user) => user.isActive && user.userRoles.some((assignment) => assignment.role.code === "ADMIN"),
      ),
      total: users.filter((user) => user.isActive).length,
    },
    rbac: { missingPermissions: [...missingPermissions] },
    weighbridge: {
      configured: weighbridges.length > 0,
      name: weighbridges[0]?.name ?? null,
    },
    gateway: {
      registered: gateways.length > 0,
      connected: connectedGateway !== undefined,
      status: connectedGateway ? "ONLINE" : (gateways[0]?.status ?? null),
    },
    devices: {
      indicatorConfigured:
        devices.some((device) => device.deviceType === "WEIGHBRIDGE_INDICATOR") || weighbridges.length > 0,
      anprConfigured:
        cameras.length > 0 || devices.some((device) => device.deviceType === "CAMERA"),
      scannerConfigured: devices.some(
        (device) => device.deviceType === "SCANNER" || device.deviceType === "BARCODE_SCANNER",
      ),
      protocolInformationRequired: devices.some(
        (device) => device.protocolReadiness === "PROTOCOL_DETAILS_REQUIRED",
      ),
    },
    materials: materials
      .filter((material) => material.isActive)
      .map((material) => ({
        name: material.name,
        code: material.code,
        hasPublishedWorkflow: material.assignments.some((assignment) => assignment.workflowDefinition.isActive),
      })),
    workflows: workflows.map((workflow) => ({
      name: workflow.name,
      code: workflow.code,
      isActive: workflow.isActive,
      steps: workflow.steps.map((step) => ({
        capability: step.capability,
        isRequired: step.isRequired,
        name: step.name,
        approvalDepartmentId: step.approvalDepartmentId,
      })),
    })),
    documents: { configured: documentCodes.length > 0 },
    unloading: { configured: unloadingPoints.length > 0 },
    notifications: {
      recipientsConfigured: input.settings.notificationRecipientUserIds.length > 0,
    },
    language: {
      defaultConfigured: Boolean(organization && isDriverLocale(organization.defaultLanguage)),
    },
    hardwareTests: hardware,
    loginWorks: actor.user.isActive && actor.user.organizationId === input.organizationId,
    siteIsolationConfigured: organization !== null,
    offlinePolicyAvailable: offlinePolicy !== null,
    monitoringAvailable: true,
    backupConfigured: env.backupEnabled || backupCount > 0,
    operationMode: site?.operationMode ?? "SIMULATION",
  };
}

export function readHardwareCheck(value: unknown): OnboardingValidationSnapshot["hardwareTests"] {
  if (typeof value !== "object" || value === null) {
    return {
      weightTested: false,
      weightOk: false,
      anprTested: false,
      anprOk: false,
      scannerTested: false,
      scannerOk: false,
    };
  }
  const record = value as Record<string, unknown>;
  return {
    weightTested: record.weightTested === true,
    weightOk: record.weightOk === true,
    anprTested: record.anprTested === true,
    anprOk: record.anprOk === true,
    scannerTested: record.scannerTested === true,
    scannerOk: record.scannerOk === true,
  };
}

export function currentStepOrDefault(value: string): OnboardingStepKey {
  return (ONBOARDING_STEP_KEYS as readonly string[]).includes(value)
    ? (value as OnboardingStepKey)
    : "ORGANIZATION";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}
