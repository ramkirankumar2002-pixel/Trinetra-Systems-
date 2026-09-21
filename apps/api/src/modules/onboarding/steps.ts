import { randomBytes } from "node:crypto";
import { Prisma, UnloadingPointStatus, WeighbridgeProviderType } from "@prisma/client";
import { env } from "../../config/env.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { GATEWAY_NOT_CONNECTED_MESSAGE, type OnboardingStepKey } from "../../domain/onboarding/catalog.js";
import { PROTOCOL_INFORMATION_REQUIRED_MESSAGE } from "../../domain/protocolReadiness.js";
import { canPublishWorkflow, workflowPublishErrors } from "../../domain/onboarding/workflowPublish.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { hashPassword } from "../../lib/password.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { createCamera } from "../cameras/service.js";
import { createDevice, createGateway } from "../edge/service.js";
import { createMaterial, assignMaterialWorkflow } from "../materials/service.js";
import { updateSiteOperationMode } from "../pilot/service.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedSite } from "../shared/siteScope.js";
import { createTransaction } from "../transactions/service.js";
import { createUnloadingPoint } from "../unloadingPoints/service.js";
import { updateWorkflow } from "../workflows/service.js";
import { hasBlockingErrors, unacceptedWarnings } from "../../domain/onboarding/validation.js";
import { runHardwareChecks, runReadiness, runValidation } from "./checks.js";
import { parseSessionSettings, type SessionSettings } from "./snapshot.js";
import {
  parseDepartmentStep,
  parseDeviceStep,
  parseDocumentStep,
  parseGatewayStep,
  parseMaterialStep,
  parseNotificationStep,
  parseOrganizationStep,
  parseSiteStep,
  parseUnloadingStep,
  parseUserStep,
  parseValidationStep,
  parseWeighbridgeStep,
  parseWorkflowStep,
} from "./validators.js";

export type StepApplyResult = {
  issuedCredential?: string | undefined;
  temporaryPassword?: string | undefined;
  created?: Record<string, unknown> | undefined;
  validation?: Awaited<ReturnType<typeof runValidation>> | undefined;
  readiness?: Awaited<ReturnType<typeof runReadiness>> | undefined;
  hardware?: Awaited<ReturnType<typeof runHardwareChecks>> | undefined;
  transaction?: { id: string; referenceNumber: string; operationMode: string } | undefined;
  settings: SessionSettings;
  siteId: string | null;
  hardwareCheck?: Prisma.InputJsonValue | undefined;
  acceptedWarningKeys?: string[] | undefined;
  statusHint?: "READY_FOR_VALIDATION" | "BLOCKED" | "IN_PROGRESS" | undefined;
};

export async function applyConfiguredStep(
  actor: ActorContext,
  session: {
    id: string;
    organizationId: string;
    siteId: string | null;
    settings: Prisma.JsonValue | null;
    acceptedWarningKeys: string[];
    lastHardwareCheck: Prisma.JsonValue | null;
  },
  step: OnboardingStepKey,
  payload: Record<string, unknown>,
  complete: boolean,
): Promise<StepApplyResult> {
  const settings = parseSessionSettings(session.settings);
  const hasPayload = Object.keys(payload).some((key) => key !== "complete" && key !== "step");
  const result: StepApplyResult = { settings, siteId: session.siteId };

  switch (step) {
    case "ORGANIZATION":
      await applyOrganization(actor, hasPayload ? payload : undefined, complete);
      break;
    case "SITE":
      result.siteId = await applySite(actor, session, hasPayload ? payload : undefined, complete);
      break;
    case "DEPARTMENTS":
      result.settings = await applyDepartments(actor, settings, hasPayload ? payload : undefined, complete);
      break;
    case "USERS": {
      const created = await applyUsers(actor, session.siteId, hasPayload ? payload : undefined, complete);
      if (created) {
        result.created = { userId: created.userId, email: created.email };
        result.temporaryPassword = created.temporaryPassword;
      }
      break;
    }
    case "WEIGHBRIDGE":
      await applyWeighbridge(actor, requireSite(session.siteId, complete || hasPayload), hasPayload ? payload : undefined, complete);
      break;
    case "GATEWAY": {
      const created = await applyGateway(actor, requireSite(session.siteId, complete || hasPayload), hasPayload ? payload : undefined, complete);
      if (created?.credential) {
        result.issuedCredential = created.credential;
        result.created = { gatewayId: created.gatewayId };
      }
      break;
    }
    case "DEVICES":
      await applyDevices(actor, requireSite(session.siteId, complete || hasPayload), hasPayload ? payload : undefined, complete);
      break;
    case "MATERIALS":
      await applyMaterials(actor, session.siteId, hasPayload ? payload : undefined, complete);
      break;
    case "WORKFLOWS":
      await applyWorkflows(actor, hasPayload ? payload : undefined, complete);
      break;
    case "DOCUMENTS":
      result.settings = await applyDocuments(actor, settings, hasPayload ? payload : undefined, complete);
      break;
    case "UNLOADING":
      await applyUnloading(actor, requireSite(session.siteId, complete || hasPayload), hasPayload ? payload : undefined, complete);
      break;
    case "NOTIFICATIONS":
      result.settings = await applyNotifications(actor, settings, hasPayload ? payload : undefined, complete);
      if (complete) {
        result.statusHint = "READY_FOR_VALIDATION";
      }
      break;
    case "VALIDATION": {
      if (hasPayload) {
        const parsed = parseValidationStep(payload);
        result.acceptedWarningKeys = parsed.acceptedWarningKeys;
      }
      const validation = await runValidation(actor, {
        organizationId: session.organizationId,
        siteId: session.siteId,
        settings: result.settings,
        lastHardwareCheck: session.lastHardwareCheck,
      });
      result.validation = validation;
      if (complete) {
        if (hasBlockingErrors(validation.findings)) {
          result.statusHint = "BLOCKED";
          throw new HttpError(409, "Resolve ERROR items before continuing.");
        }
        const pending = unacceptedWarnings(validation.findings, result.acceptedWarningKeys ?? session.acceptedWarningKeys);
        if (pending.length > 0) {
          throw new HttpError(409, "Accept remaining warnings before continuing.");
        }
      }
      break;
    }
    case "PILOT_READINESS": {
      const readiness = await runReadiness(actor, {
        organizationId: session.organizationId,
        siteId: session.siteId,
        settings: result.settings,
        lastHardwareCheck: session.lastHardwareCheck,
      });
      result.readiness = readiness;
      if (complete) {
        const blocking = readiness.items.filter(
          (item) => item.status === "FAIL" && item.key !== "gateway" && item.key !== "weight" && item.key !== "anpr" && item.key !== "scanner",
        );
        if (blocking.length > 0) {
          throw new HttpError(409, blocking[0]?.message ?? "Pilot readiness failed.");
        }
      }
      break;
    }
    default: {
      const _exhaustive: never = step;
      throw new HttpError(400, `Unsupported step ${_exhaustive}`);
    }
  }

  return result;
}

export async function runSessionHardwareChecks(actor: ActorContext, siteId: string | null) {
  return runHardwareChecks(actor, siteId);
}

export async function startPilotTestTransaction(
  actor: ActorContext,
  siteId: string | null,
): Promise<{ id: string; referenceNumber: string; operationMode: string }> {
  if (!siteId) {
    throw new HttpError(400, "A site is required for a pilot test");
  }
  await assertRequestedSite(actor, siteId);
  const weighbridge = await prisma.weighbridge.findFirst({
    where: { organizationId: actor.user.organizationId, siteId, isActive: true },
    orderBy: { code: "asc" },
  });
  if (!weighbridge) {
    throw new HttpError(409, "A weighbridge is required for a pilot test");
  }
  await updateSiteOperationMode(actor, siteId, { operationMode: "PILOT" });
  const transaction = await createTransaction(actor, { weighbridgeId: weighbridge.id, siteId });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_PILOT_TEST_COMPLETED,
    entityType: "OnboardingSession",
    entityId: transaction.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { transactionId: transaction.id, operationMode: "PILOT" },
  });
  return {
    id: transaction.id,
    referenceNumber: transaction.referenceNumber,
    operationMode: "PILOT",
  };
}

async function applyOrganization(
  actor: ActorContext,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  const organization = await prisma.organization.findUnique({ where: { id: actor.user.organizationId } });
  if (!organization) {
    throw new HttpError(404, "Organization not found");
  }
  if (!payload) {
    if (complete && (organization.name.trim() === "" || organization.slug.trim() === "")) {
      throw new HttpError(400, "Organization name and code are required");
    }
    return;
  }
  const input = parseOrganizationStep(payload);
  const slugOwner = await prisma.organization.findFirst({
    where: { slug: input.code, NOT: { id: organization.id } },
    select: { id: true },
  });
  if (slugOwner) {
    throw new HttpError(409, "This organization code is already in use");
  }
  await prisma.organization.update({
    where: { id: organization.id },
    data: {
      name: input.name,
      slug: input.code,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      defaultLanguage: input.defaultLanguage,
      enabledDriverLanguages: input.languages,
      driverVoiceEnabled: input.voiceEnabled,
      driverAudioEnabled: input.audioEnabled,
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_ORGANIZATION_UPDATED,
    entityType: "Organization",
    entityId: organization.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { slug: input.code },
  });
}

async function applySite(
  actor: ActorContext,
  session: { siteId: string | null; organizationId: string },
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<string | null> {
  if (!payload) {
    if (complete && !session.siteId) {
      throw new HttpError(400, "A site is required");
    }
    return session.siteId;
  }
  const input = parseSiteStep(payload);
  if (session.siteId) {
    await assertRequestedSite(actor, session.siteId);
    const updated = await prisma.site.update({
      where: { id: session.siteId },
      data: {
        name: input.name,
        code: input.code,
        timezone: input.timezone,
        location: input.location ?? null,
      },
    });
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.ONBOARDING_SITE_UPDATED,
      entityType: "Site",
      entityId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: updated.code },
    });
    return updated.id;
  }

  const existing = await prisma.site.findFirst({
    where: { organizationId: actor.user.organizationId, code: input.code, deletedAt: null },
  });
  if (existing) {
    assertSiteAccess(actor.user, existing.id);
    return existing.id;
  }

  try {
    const created = await prisma.site.create({
      data: {
        organizationId: actor.user.organizationId,
        name: input.name,
        code: input.code,
        timezone: input.timezone,
        location: input.location ?? null,
        status: "ACTIVE",
        operationMode: "SIMULATION",
      },
    });
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.ONBOARDING_SITE_CREATED,
      entityType: "Site",
      entityId: created.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: created.code },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "A site with this code already exists");
    }
    throw error;
  }
}

async function applyDepartments(
  actor: ActorContext,
  settings: SessionSettings,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<SessionSettings> {
  const departments = await prisma.department.findMany({
    where: { organizationId: actor.user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!payload) {
    if (complete && departments.length === 0) {
      throw new HttpError(409, "At least one department must exist");
    }
    return settings.selectedDepartmentIds.length > 0
      ? settings
      : { ...settings, selectedDepartmentIds: departments.map((department) => department.id) };
  }
  const input = parseDepartmentStep(payload);
  if (input.selectedDepartmentIds.length > 0) {
    const found = await prisma.department.count({
      where: {
        organizationId: actor.user.organizationId,
        deletedAt: null,
        id: { in: input.selectedDepartmentIds },
      },
    });
    if (found !== input.selectedDepartmentIds.length) {
      throw new HttpError(400, "One or more departments were not found");
    }
  }
  return { ...settings, selectedDepartmentIds: input.selectedDepartmentIds };
}

async function applyUsers(
  actor: ActorContext,
  siteId: string | null,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<{ userId: string; email: string; temporaryPassword: string } | null> {
  if (!payload) {
    if (complete) {
      await assertAdministratorExists(actor.user.organizationId);
    }
    return null;
  }
  const input = parseUserStep(payload);
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, organizationId: actor.user.organizationId },
  });
  if (!role) {
    throw new HttpError(400, "Role was not found");
  }
  const userSiteId = input.siteId ?? siteId ?? undefined;
  if (userSiteId) {
    await assertRequestedSite(actor, userSiteId);
  }
  if (input.weighbridgeId) {
    const weighbridge = await prisma.weighbridge.findFirst({
      where: { id: input.weighbridgeId, organizationId: actor.user.organizationId },
    });
    if (!weighbridge) {
      throw new HttpError(404, "Weighbridge not found");
    }
    if (userSiteId && weighbridge.siteId !== userSiteId) {
      throw new HttpError(400, "Weighbridge does not belong to that site");
    }
    assertSiteAccess(actor.user, weighbridge.siteId);
  }
  if (input.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: input.departmentId, organizationId: actor.user.organizationId, deletedAt: null },
    });
    if (!department) {
      throw new HttpError(400, "Department was not found");
    }
  }

  const existing = await prisma.user.findFirst({
    where: { organizationId: actor.user.organizationId, email: input.email, deletedAt: null },
  });
  if (existing) {
    const existingRole = await prisma.userRole.findFirst({
      where: {
        userId: existing.id,
        roleId: role.id,
        siteId: userSiteId ?? null,
      },
    });
    if (existingRole) {
      await prisma.userRole.update({
        where: { id: existingRole.id },
        data: { weighbridgeId: input.weighbridgeId ?? null },
      });
    } else {
      await prisma.userRole.create({
        data: {
          userId: existing.id,
          roleId: role.id,
          siteId: userSiteId ?? null,
          weighbridgeId: input.weighbridgeId ?? null,
        },
      });
    }
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.ONBOARDING_USER_ADDED,
      entityType: "User",
      entityId: existing.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { email: existing.email, role: role.code },
    });
    return null;
  }

  const temporaryPassword = randomBytes(18).toString("base64url");
  const created = await prisma.user.create({
    data: {
      organizationId: actor.user.organizationId,
      email: input.email,
      fullName: input.fullName,
      passwordHash: await hashPassword(temporaryPassword),
      isActive: true,
      defaultSiteId: userSiteId ?? null,
      defaultDepartmentId: input.departmentId ?? null,
      userRoles: {
        create: {
          roleId: role.id,
          siteId: userSiteId ?? null,
          weighbridgeId: input.weighbridgeId ?? null,
        },
      },
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_USER_ADDED,
    entityType: "User",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { email: created.email, role: role.code },
  });
  return { userId: created.id, email: created.email, temporaryPassword };
}

async function applyWeighbridge(
  actor: ActorContext,
  siteId: string,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  await assertRequestedSite(actor, siteId);
  if (!payload) {
    if (complete) {
      const count = await prisma.weighbridge.count({
        where: { organizationId: actor.user.organizationId, siteId },
      });
      if (count === 0) {
        throw new HttpError(409, "A weighbridge is required");
      }
    }
    return;
  }
  const input = parseWeighbridgeStep(payload);
  const existing = await prisma.weighbridge.findFirst({
    where: { siteId, code: input.code },
  });
  if (existing) {
    await prisma.weighbridge.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        capacityKg: input.capacityKg ?? existing.capacityKg,
      },
    });
    return;
  }
  const created = await prisma.weighbridge.create({
    data: {
      organizationId: actor.user.organizationId,
      siteId,
      code: input.code,
      name: input.name,
      capacityKg: input.capacityKg ?? null,
      isActive: true,
      hardwareProfile: {
        create: {
          organizationId: actor.user.organizationId,
          siteId,
          providerType: WeighbridgeProviderType.SIMULATOR,
          connectionType: "NONE",
          deviceName: input.name,
          deviceIdentifier: input.code,
          enabled: true,
          unit: input.unit,
          simulatorMode: "AUTO",
        },
      },
    },
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_WEIGHBRIDGE_CONFIGURED,
    entityType: "Weighbridge",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { code: created.code, hardwareMode: input.hardwareMode },
  });
}

async function applyGateway(
  actor: ActorContext,
  siteId: string,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<{ gatewayId: string; credential?: string | undefined } | null> {
  await assertRequestedSite(actor, siteId);
  let gatewayId: string | null = null;
  let credential: string | undefined;
  if (payload) {
    const input = parseGatewayStep(payload);
    const existing = await prisma.edgeGateway.findFirst({
      where: { organizationId: actor.user.organizationId, code: input.code },
    });
    if (existing) {
      if (existing.siteId !== siteId) {
        throw new HttpError(409, "Gateway already belongs to another site");
      }
      gatewayId = existing.id;
    } else {
      const created = await createGateway(actor, { siteId, code: input.code, name: input.name });
      gatewayId = created.gateway.id;
      credential = created.credential;
      await writeAudit({
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.ONBOARDING_GATEWAY_REGISTERED,
        entityType: "EdgeGateway",
        entityId: created.gateway.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { code: input.code },
      });
    }
  } else {
    const existing = await prisma.edgeGateway.findFirst({
      where: { organizationId: actor.user.organizationId, siteId },
    });
    gatewayId = existing?.id ?? null;
  }

  if (complete) {
    if (!gatewayId) {
      throw new HttpError(409, "Gateway is not registered");
    }
    const gateway = await prisma.edgeGateway.findFirst({ where: { id: gatewayId } });
    if (!gateway) {
      throw new HttpError(409, "Gateway is not registered");
    }
    const status = deriveGatewayRuntimeStatus({
      enabled: gateway.enabled,
      revokedAt: gateway.revokedAt,
      lastHeartbeatAt: gateway.lastHeartbeatAt,
      nowMs: Date.now(),
      offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
    });
    if (status !== "ONLINE") {
      throw new HttpError(409, GATEWAY_NOT_CONNECTED_MESSAGE);
    }
  }
  return gatewayId ? { gatewayId, ...(credential === undefined ? {} : { credential }) } : null;
}

async function applyDevices(
  actor: ActorContext,
  siteId: string,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  await assertRequestedSite(actor, siteId);
  if (payload) {
    const input = parseDeviceStep(payload);
    const gateway = await prisma.edgeGateway.findFirst({
      where: { id: input.gatewayId, organizationId: actor.user.organizationId, siteId },
    });
    if (!gateway) {
      throw new HttpError(404, "Gateway not found");
    }
    if (input.provider !== "SIMULATOR" && !input.protocol) {
      throw new HttpError(400, PROTOCOL_INFORMATION_REQUIRED_MESSAGE);
    }
    const existing = await prisma.edgeDevice.findFirst({
      where: { gatewayId: gateway.id, code: input.code },
    });
    if (!existing) {
      if (input.deviceType === "CAMERA" && input.weighbridgeId) {
        await createCamera(actor, {
          weighbridgeId: input.weighbridgeId,
          name: input.name,
          cameraIdentifier: input.code,
          purpose: "ENTRY_ANPR",
          cameraProviderType: "SIMULATOR",
          connectionType: "SIMULATOR",
          anprProviderType: "SIMULATOR",
          enabled: true,
          highConfidenceMin: 0.9,
          mediumConfidenceMin: 0.7,
          simulatorScenario: "HIGH_KNOWN",
        });
      }
      await createDevice(actor, gateway.id, {
        deviceType: input.deviceType,
        code: input.code,
        name: input.name,
        provider: input.provider ?? "SIMULATOR",
        ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.protocol === undefined ? {} : { protocol: input.protocol }),
        ...(input.interfaceType === undefined ? {} : { connectionType: input.interfaceType }),
        ...(input.weighbridgeId === undefined ? {} : { weighbridgeId: input.weighbridgeId }),
        ...(input.cameraId === undefined ? {} : { cameraId: input.cameraId }),
      });
      await writeAudit({
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.ONBOARDING_DEVICE_CONFIGURED,
        entityType: "EdgeDevice",
        entityId: gateway.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { code: input.code, deviceType: input.deviceType },
      });
    }
  }
  if (complete) {
    const [weighbridges, devices] = await Promise.all([
      prisma.weighbridge.count({ where: { organizationId: actor.user.organizationId, siteId } }),
      prisma.edgeDevice.findMany({ where: { organizationId: actor.user.organizationId, siteId } }),
    ]);
    const hasIndicator = weighbridges > 0 || devices.some((device) => device.deviceType === "WEIGHBRIDGE_INDICATOR");
    if (!hasIndicator) {
      throw new HttpError(409, "Required weight indicator is not configured");
    }
    if (
      devices.some((device) => device.protocolReadiness === "PROTOCOL_DETAILS_REQUIRED") &&
      !devices.some((device) => device.provider === "SIMULATOR" || device.protocolReadiness === "SIMULATOR")
    ) {
      throw new HttpError(409, PROTOCOL_INFORMATION_REQUIRED_MESSAGE);
    }
  }
}

async function applyMaterials(
  actor: ActorContext,
  siteId: string | null,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  if (payload) {
    const input = parseMaterialStep(payload);
    const existing = await prisma.material.findFirst({
      where: { organizationId: actor.user.organizationId, code: input.code, deletedAt: null },
    });
    const material = existing
      ? existing
      : await createMaterial(actor, {
          code: input.code,
          name: input.name,
          unitOfMeasure: input.unitOfMeasure ?? env.materialUnits[0] ?? "MT",
          isActive: input.isActive,
        });
    if (input.workflowDefinitionId) {
      await assignMaterialWorkflow(actor, material.id, {
        workflowDefinitionId: input.workflowDefinitionId,
        ...(siteId ? { siteId } : {}),
      });
    }
    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.ONBOARDING_MATERIAL_CONFIGURED,
      entityType: "Material",
      entityId: material.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: input.code },
    });
  }
  if (complete) {
    const count = await prisma.material.count({
      where: { organizationId: actor.user.organizationId, deletedAt: null, isActive: true },
    });
    if (count === 0) {
      throw new HttpError(409, "Required materials are not configured");
    }
  }
}

async function applyWorkflows(
  actor: ActorContext,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  if (payload) {
    const input = parseWorkflowStep(payload);
    const workflow = await prisma.workflowDefinition.findFirst({
      where: { id: input.workflowId, organizationId: actor.user.organizationId },
      include: { steps: true },
    });
    if (!workflow) {
      throw new HttpError(404, "Workflow not found");
    }
    const errors = workflowPublishErrors({
      name: workflow.name,
      code: workflow.code,
      isActive: true,
      steps: workflow.steps.map((step) => ({
        capability: step.capability,
        isRequired: step.isRequired,
        name: step.name,
        approvalDepartmentId: step.approvalDepartmentId,
      })),
    });
    if (input.publish && errors.length > 0) {
      throw new HttpError(409, errors[0] ?? "Workflow is not valid");
    }
    if (input.publish) {
      await updateWorkflow(actor, workflow.id, { isActive: true });
      await writeAudit({
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.ONBOARDING_WORKFLOW_PUBLISHED,
        entityType: "WorkflowDefinition",
        entityId: workflow.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { code: workflow.code },
      });
    }
  }
  if (complete) {
    const workflows = await prisma.workflowDefinition.findMany({
      where: { organizationId: actor.user.organizationId, isActive: true },
      include: { steps: true },
    });
    const valid = workflows.filter((workflow) =>
      canPublishWorkflow({
        name: workflow.name,
        code: workflow.code,
        isActive: workflow.isActive,
        steps: workflow.steps.map((step) => ({
          capability: step.capability,
          isRequired: step.isRequired,
          name: step.name,
          approvalDepartmentId: step.approvalDepartmentId,
        })),
      }),
    );
    if (valid.length === 0) {
      throw new HttpError(409, "A valid published workflow is required");
    }
  }
}

async function applyDocuments(
  actor: ActorContext,
  settings: SessionSettings,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<SessionSettings> {
  if (!payload) {
    const organization = await prisma.organization.findUnique({
      where: { id: actor.user.organizationId },
      select: { documentTypeCodes: true },
    });
    const codes = organization && organization.documentTypeCodes.length > 0 ? organization.documentTypeCodes : settings.documentTypeCodes;
    if (complete && codes.length === 0) {
      throw new HttpError(409, "Required document types are not configured");
    }
    return { ...settings, documentTypeCodes: codes };
  }
  const input = parseDocumentStep(payload);
  await prisma.organization.update({
    where: { id: actor.user.organizationId },
    data: { documentTypeCodes: input.documentTypeCodes },
  });
  return { ...settings, documentTypeCodes: input.documentTypeCodes };
}

async function applyUnloading(
  actor: ActorContext,
  siteId: string,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<void> {
  await assertRequestedSite(actor, siteId);
  if (payload) {
    const input = parseUnloadingStep(payload);
    const existing = await prisma.unloadingPoint.findFirst({
      where: { siteId, code: input.code, deletedAt: null },
    });
    if (!existing) {
      await createUnloadingPoint(actor, {
        siteId,
        code: input.code,
        name: input.name,
        status: UnloadingPointStatus.AVAILABLE,
        isActive: true,
        allowedMaterialIds: [],
        sortOrder: 100,
      });
    }
  }
  if (complete) {
    const count = await prisma.unloadingPoint.count({
      where: { organizationId: actor.user.organizationId, siteId, deletedAt: null, isActive: true },
    });
    if (count === 0) {
      throw new HttpError(409, "Required unloading points are not configured");
    }
  }
}

async function applyNotifications(
  actor: ActorContext,
  settings: SessionSettings,
  payload: Record<string, unknown> | undefined,
  complete: boolean,
): Promise<SessionSettings> {
  if (payload) {
    const input = parseNotificationStep(payload);
    const user = await prisma.user.findFirst({
      where: { id: input.userId, organizationId: actor.user.organizationId, deletedAt: null },
    });
    if (!user) {
      throw new HttpError(404, "Recipient was not found");
    }
    for (const category of input.categories) {
      if (category !== "WORKFLOW" && category !== "APPROVAL" && category !== "EXCEPTION" && category !== "SYSTEM") {
        throw new HttpError(400, "Unsupported notification category");
      }
      await prisma.notificationPreference.upsert({
        where: { userId_category: { userId: user.id, category } },
        update: { inAppEnabled: true },
        create: { userId: user.id, category, inAppEnabled: true },
      });
    }
    const recipientIds = [...new Set([...settings.notificationRecipientUserIds, user.id])];
    return { ...settings, notificationRecipientUserIds: recipientIds };
  }
  if (complete && settings.notificationRecipientUserIds.length === 0) {
    throw new HttpError(409, "Required notification recipients are not configured");
  }
  return settings;
}

async function assertAdministratorExists(organizationId: string): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: {
      organizationId,
      deletedAt: null,
      isActive: true,
      userRoles: { some: { role: { code: "ADMIN" } } },
    },
  });
  if (!admin) {
    throw new HttpError(409, "No active administrator exists");
  }
}

function requireSite(siteId: string | null, _required: boolean): string {
  if (!siteId) {
    throw new HttpError(400, "Complete site setup before this step");
  }
  return siteId;
}
