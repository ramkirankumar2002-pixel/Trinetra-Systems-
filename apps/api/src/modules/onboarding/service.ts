import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { DRIVER_LOCALES } from "../../domain/driverConfig.js";
import { documentTypeLabel } from "../../domain/documentTypes.js";
import {
  isOpenOnboardingStatus,
  isTerminalOnboardingStatus,
  ONBOARDING_STEP_KEYS,
  TYPICAL_DEPARTMENTS,
  type OnboardingStepKey,
} from "../../domain/onboarding/catalog.js";
import {
  canCompleteStep,
  canVisitStep,
  completionPercent,
  frontierStep,
  withCompletedStep,
} from "../../domain/onboarding/progress.js";
import { hasBlockingErrors, unacceptedWarnings, type ReadinessItem } from "../../domain/onboarding/validation.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { assertRequestedSite } from "../shared/siteScope.js";
import {
  previousHardwareFromCheck,
  runReadiness,
  runValidation,
  type HardwareCheckResult,
  type ValidationResult,
} from "./checks.js";
import { onboardingSessionInclude, toDashboardRow, toPublicOnboardingSession, type PublicOnboardingSession } from "./mapper.js";
import { settingsToJson } from "./snapshot.js";
import { applyConfiguredStep, runSessionHardwareChecks, startPilotTestTransaction } from "./steps.js";
import type { ApplyStepInput, CreateOnboardingInput } from "./validators.js";

type SessionRow = Prisma.OnboardingSessionGetPayload<{ include: typeof onboardingSessionInclude }>;

export async function listOnboardingSessions(actor: ActorContext) {
  const rows = await prisma.onboardingSession.findMany({
    where: { organizationId: actor.user.organizationId },
    include: onboardingSessionInclude,
    orderBy: { updatedAt: "desc" },
  });
  return {
    items: rows
      .filter((row) => row.siteId === null || canAccessSite(actor.user, row.siteId))
      .map(toDashboardRow),
  };
}

export async function createOnboardingSession(
  actor: ActorContext,
  input: CreateOnboardingInput,
): Promise<PublicOnboardingSession> {
  if (input.siteId) {
    await assertRequestedSite(actor, input.siteId);
  }

  const existing = await prisma.onboardingSession.findFirst({
    where: {
      organizationId: actor.user.organizationId,
      status: { in: ["DRAFT", "IN_PROGRESS", "READY_FOR_VALIDATION", "BLOCKED"] },
      ...(input.siteId ? { siteId: input.siteId } : {}),
    },
    include: onboardingSessionInclude,
    orderBy: { updatedAt: "desc" },
  });
  if (existing && (input.siteId === undefined || existing.siteId === input.siteId || existing.siteId === null)) {
    return toPublicOnboardingSession(existing);
  }

  const created = await prisma.onboardingSession.create({
    data: {
      organizationId: actor.user.organizationId,
      siteId: input.siteId ?? null,
      createdByUserId: actor.user.id,
      currentStep: "ORGANIZATION",
      status: "DRAFT",
      completionPercent: 0,
      notes: input.notes ?? null,
      settings: settingsToJson({
        selectedDepartmentIds: [],
        documentTypeCodes: [],
        notificationRecipientUserIds: [],
      }),
    },
    include: onboardingSessionInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_STARTED,
    entityType: "OnboardingSession",
    entityId: created.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: input.siteId ? { siteId: input.siteId } : undefined,
  });

  return toPublicOnboardingSession(created);
}

export async function getOnboardingSession(actor: ActorContext, sessionId: string) {
  const session = await loadSession(actor, sessionId);
  return {
    session: toPublicOnboardingSession(session),
    catalog: await loadCatalog(actor, session.siteId),
  };
}

export async function applyOnboardingStep(
  actor: ActorContext,
  sessionId: string,
  input: ApplyStepInput,
): Promise<{
  session: PublicOnboardingSession;
  issuedCredential?: string | undefined;
  temporaryPassword?: string | undefined;
  created?: Record<string, unknown> | undefined;
  validation?: ValidationResult | undefined;
  readiness?: { items: ReadinessItem[] } | undefined;
  hardware?: HardwareCheckResult | undefined;
}> {
  const session = await loadMutableSession(actor, sessionId);
  if (input.complete && !canCompleteStep(session.completedSteps, input.step)) {
    throw new HttpError(409, "Complete the previous mandatory steps first");
  }
  if (!input.complete && !canVisitStep(session.completedSteps, input.step) && input.step !== session.currentStep) {
    throw new HttpError(409, "This step is not available yet");
  }

  const applied = await applyConfiguredStep(actor, session, input.step, input.payload, input.complete);
  const completedSteps = input.complete
    ? withCompletedStep(session.completedSteps, input.step)
    : session.completedSteps.filter((step): step is OnboardingStepKey =>
        (ONBOARDING_STEP_KEYS as readonly string[]).includes(step),
      );
  const currentStep = input.complete ? frontierStep(completedSteps) : session.currentStep;
  const status =
    applied.statusHint ??
    (completedSteps.includes("NOTIFICATIONS")
      ? "READY_FOR_VALIDATION"
      : session.status === "DRAFT"
        ? "IN_PROGRESS"
        : session.status === "BLOCKED"
          ? "IN_PROGRESS"
          : session.status);

  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      siteId: applied.siteId,
      currentStep,
      status,
      completedSteps,
      completionPercent: completionPercent(completedSteps),
      settings: settingsToJson(applied.settings),
      ...(applied.acceptedWarningKeys === undefined ? {} : { acceptedWarningKeys: applied.acceptedWarningKeys }),
      ...(applied.validation === undefined
        ? {}
        : { lastValidation: { findings: applied.validation.findings } satisfies Prisma.InputJsonValue }),
      ...(applied.readiness === undefined
        ? {}
        : { lastReadiness: { items: applied.readiness.items } satisfies Prisma.InputJsonValue }),
      ...(applied.hardwareCheck === undefined ? {} : { lastHardwareCheck: applied.hardwareCheck }),
    },
    include: onboardingSessionInclude,
  });

  return {
    session: toPublicOnboardingSession(updated),
    ...(applied.issuedCredential === undefined ? {} : { issuedCredential: applied.issuedCredential }),
    ...(applied.temporaryPassword === undefined ? {} : { temporaryPassword: applied.temporaryPassword }),
    ...(applied.created === undefined ? {} : { created: applied.created }),
    ...(applied.validation === undefined ? {} : { validation: applied.validation }),
    ...(applied.readiness === undefined ? {} : { readiness: applied.readiness }),
    ...(applied.hardware === undefined ? {} : { hardware: applied.hardware }),
  };
}

export async function validateOnboarding(actor: ActorContext, sessionId: string) {
  const session = await loadSession(actor, sessionId);
  const result = await runValidation(actor, session);
  const status = hasBlockingErrors(result.findings)
    ? "BLOCKED"
    : session.status === "CANCELLED" || session.status === "COMPLETED"
      ? session.status
      : "READY_FOR_VALIDATION";
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      lastValidation: { findings: result.findings },
      status,
    },
    include: onboardingSessionInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_VALIDATION_COMPLETED,
    entityType: "OnboardingSession",
    entityId: session.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { errorCount: result.errorCount, warningCount: result.warningCount },
  });
  return { session: toPublicOnboardingSession(updated), validation: result };
}

export async function getValidationResults(actor: ActorContext, sessionId: string) {
  const session = await loadSession(actor, sessionId);
  if (session.lastValidation) {
    const result = await runValidation(actor, session);
    return { session: toPublicOnboardingSession(session), validation: result };
  }
  return validateOnboarding(actor, sessionId);
}

export async function hardwareOnboardingChecks(actor: ActorContext, sessionId: string) {
  const session = await loadMutableSession(actor, sessionId);
  const hardware = await runSessionHardwareChecks(actor, session.siteId);
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: { lastHardwareCheck: previousHardwareFromCheck(hardware) },
    include: onboardingSessionInclude,
  });
  return { session: toPublicOnboardingSession(updated), hardware };
}

export async function pilotReadinessCheck(actor: ActorContext, sessionId: string) {
  const session = await loadSession(actor, sessionId);
  const readiness = await runReadiness(actor, session);
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: { lastReadiness: { items: readiness.items } },
    include: onboardingSessionInclude,
  });
  return { session: toPublicOnboardingSession(updated), readiness };
}

export async function runPilotTest(actor: ActorContext, sessionId: string) {
  const session = await loadMutableSession(actor, sessionId);
  const transaction = await startPilotTestTransaction(actor, session.siteId);
  return { transaction };
}

export async function completeOnboarding(actor: ActorContext, sessionId: string) {
  const session = await loadMutableSession(actor, sessionId);
  const missing = ONBOARDING_STEP_KEYS.filter((step) => !session.completedSteps.includes(step));
  if (missing.length > 0) {
    throw new HttpError(409, "All onboarding steps must be completed first");
  }
  const validation = await runValidation(actor, session);
  if (hasBlockingErrors(validation.findings)) {
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: "BLOCKED", lastValidation: { findings: validation.findings } },
    });
    throw new HttpError(409, "Resolve ERROR items before onboarding can be completed");
  }
  const pending = unacceptedWarnings(validation.findings, session.acceptedWarningKeys);
  if (pending.length > 0) {
    throw new HttpError(409, "Accept remaining warnings before completing onboarding");
  }

  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      completionPercent: 100,
      lastValidation: { findings: validation.findings },
    },
    include: onboardingSessionInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_COMPLETED,
    entityType: "OnboardingSession",
    entityId: session.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  return { session: toPublicOnboardingSession(updated), validation };
}

export async function cancelOnboarding(actor: ActorContext, sessionId: string, notes?: string | undefined) {
  const session = await loadSession(actor, sessionId);
  if (session.status === "COMPLETED") {
    throw new HttpError(409, "A completed onboarding cannot be cancelled");
  }
  if (session.status === "CANCELLED") {
    return toPublicOnboardingSession(session);
  }
  const updated = await prisma.onboardingSession.update({
    where: { id: session.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      ...(notes === undefined ? {} : { notes }),
    },
    include: onboardingSessionInclude,
  });
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ONBOARDING_CANCELLED,
    entityType: "OnboardingSession",
    entityId: session.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { retainedCustomerData: true },
  });
  return toPublicOnboardingSession(updated);
}

async function loadSession(actor: ActorContext, sessionId: string): Promise<SessionRow> {
  const session = await prisma.onboardingSession.findFirst({
    where: { id: sessionId, organizationId: actor.user.organizationId },
    include: onboardingSessionInclude,
  });
  if (!session) {
    throw new HttpError(404, "Onboarding session not found");
  }
  if (session.siteId && !canAccessSite(actor.user, session.siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
  return session;
}

async function loadMutableSession(actor: ActorContext, sessionId: string): Promise<SessionRow> {
  const session = await loadSession(actor, sessionId);
  if (isTerminalOnboardingStatus(session.status)) {
    throw new HttpError(409, "This onboarding session is closed");
  }
  if (!isOpenOnboardingStatus(session.status)) {
    throw new HttpError(409, "This onboarding session cannot be edited");
  }
  return session;
}

async function loadCatalog(actor: ActorContext, siteId: string | null) {
  const [organization, sites, departments, roles, users, weighbridges, gateways, materials, workflows, unloadingPoints] =
    await Promise.all([
      prisma.organization.findUnique({
        where: { id: actor.user.organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          contactName: true,
          contactEmail: true,
          defaultLanguage: true,
          enabledDriverLanguages: true,
          driverVoiceEnabled: true,
          driverAudioEnabled: true,
          documentTypeCodes: true,
        },
      }),
      prisma.site.findMany({
        where: { organizationId: actor.user.organizationId, deletedAt: null },
        select: { id: true, code: true, name: true, timezone: true, location: true, status: true, operationMode: true },
        orderBy: { name: "asc" },
      }),
      prisma.department.findMany({
        where: { organizationId: actor.user.organizationId, deletedAt: null },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.role.findMany({
        where: { organizationId: actor.user.organizationId },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { organizationId: actor.user.organizationId, deletedAt: null },
        select: {
          id: true,
          fullName: true,
          email: true,
          isActive: true,
          defaultSite: { select: { id: true, name: true } },
          defaultDepartment: { select: { id: true, name: true } },
          userRoles: { include: { role: { select: { code: true, name: true } } } },
        },
        orderBy: { fullName: "asc" },
        take: 50,
      }),
      prisma.weighbridge.findMany({
        where: {
          organizationId: actor.user.organizationId,
          ...(siteId ? { siteId } : {}),
        },
        select: { id: true, code: true, name: true, siteId: true, capacityKg: true, isActive: true },
      }),
      prisma.edgeGateway.findMany({
        where: {
          organizationId: actor.user.organizationId,
          ...(siteId ? { siteId } : {}),
        },
        select: { id: true, code: true, name: true, status: true, lastHeartbeatAt: true, enabled: true, revokedAt: true },
      }),
      prisma.material.findMany({
        where: { organizationId: actor.user.organizationId, deletedAt: null },
        select: { id: true, code: true, name: true, isActive: true },
        orderBy: { name: "asc" },
      }),
      prisma.workflowDefinition.findMany({
        where: { organizationId: actor.user.organizationId },
        select: { id: true, code: true, name: true, isActive: true, updatedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.unloadingPoint.findMany({
        where: {
          organizationId: actor.user.organizationId,
          deletedAt: null,
          ...(siteId ? { siteId } : {}),
        },
        select: { id: true, code: true, name: true, isActive: true, siteId: true },
      }),
    ]);

  return {
    typicalDepartments: TYPICAL_DEPARTMENTS,
    languages: DRIVER_LOCALES,
    documentTypes: env.documentTypes.map((code) => ({ code, label: documentTypeLabel(code) })),
    notificationCategories: ["APPROVAL", "EXCEPTION", "SYSTEM", "WORKFLOW"],
    organization,
    sites: sites.filter((site) => canAccessSite(actor.user, site.id)),
    departments,
    roles,
    users: users.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      isActive: user.isActive,
      site: user.defaultSite?.name ?? null,
      department: user.defaultDepartment?.name ?? null,
      roles: user.userRoles.map((assignment) => assignment.role.code),
    })),
    weighbridges,
    gateways: gateways.map((gateway) => ({
      ...gateway,
      lastHeartbeatAt: gateway.lastHeartbeatAt?.toISOString() ?? null,
    })),
    materials,
    workflows: workflows.map((workflow) => ({
      ...workflow,
      version: workflow.updatedAt.toISOString(),
      status: workflow.isActive ? "PUBLISHED" : "DRAFT",
    })),
    unloadingPoints,
  };
}
