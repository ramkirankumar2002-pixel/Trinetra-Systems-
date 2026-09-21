import type { OnboardingSession, Organization, Site, User } from "@prisma/client";
import {
  ONBOARDING_STEP_KEYS,
  onboardingStepLabel,
  type OnboardingSessionStatusValue,
  type OnboardingStepKey,
} from "../../domain/onboarding/catalog.js";
import { completionPercent, stepProgress, type OnboardingStepProgress } from "../../domain/onboarding/progress.js";
import type { OnboardingFinding, ReadinessItem } from "../../domain/onboarding/validation.js";

export type PublicOnboardingSession = {
  id: string;
  organization: { id: string; name: string; slug: string; status: string; kind: string };
  site: { id: string; code: string; name: string; status: string; timezone: string } | null;
  createdBy: { id: string; fullName: string; email: string };
  createdAt: string;
  updatedAt: string;
  currentStep: OnboardingStepKey;
  currentStepLabel: string;
  status: OnboardingSessionStatusValue;
  completionPercent: number;
  notes: string | null;
  steps: OnboardingStepProgress[];
  completedSteps: OnboardingStepKey[];
  acceptedWarningKeys: string[];
  lastValidation: { findings: OnboardingFinding[] } | null;
  lastReadiness: { items: ReadinessItem[] } | null;
  lastHardwareCheck: Record<string, unknown> | null;
};

export type OnboardingDashboardRow = {
  id: string;
  customer: string;
  site: string | null;
  progress: number;
  currentStep: string;
  status: OnboardingSessionStatusValue;
  blockingErrors: number;
  warnings: number;
  lastUpdated: string;
  assignedImplementationUser: string;
};

type SessionRecord = OnboardingSession & {
  organization: Pick<Organization, "id" | "name" | "slug" | "status" | "kind">;
  site: Pick<Site, "id" | "code" | "name" | "status" | "timezone"> | null;
  createdBy: Pick<User, "id" | "fullName" | "email">;
};

export const onboardingSessionInclude = {
  organization: { select: { id: true, name: true, slug: true, status: true, kind: true } },
  site: { select: { id: true, code: true, name: true, status: true, timezone: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
} as const;

export function toPublicOnboardingSession(record: SessionRecord): PublicOnboardingSession {
  const currentStep = isStep(record.currentStep) ? record.currentStep : ONBOARDING_STEP_KEYS[0];
  const completedSteps = record.completedSteps.filter(isStep);
  const findings = readFindings(record.lastValidation);
  const readiness = readReadiness(record.lastReadiness);
  return {
    id: record.id,
    organization: record.organization,
    site: record.site,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    currentStep,
    currentStepLabel: onboardingStepLabel(currentStep),
    status: record.status,
    completionPercent: record.completionPercent || completionPercent(completedSteps),
    notes: record.notes,
    steps: stepProgress({
      currentStep,
      completedSteps,
      status: record.status,
    }),
    completedSteps,
    acceptedWarningKeys: record.acceptedWarningKeys,
    lastValidation: findings ? { findings } : null,
    lastReadiness: readiness ? { items: readiness } : null,
    lastHardwareCheck: isRecord(record.lastHardwareCheck) ? record.lastHardwareCheck : null,
  };
}

export function toDashboardRow(record: SessionRecord): OnboardingDashboardRow {
  const session = toPublicOnboardingSession(record);
  const findings = session.lastValidation?.findings ?? [];
  return {
    id: session.id,
    customer: session.organization.name,
    site: session.site?.name ?? null,
    progress: session.completionPercent,
    currentStep: session.currentStepLabel,
    status: session.status,
    blockingErrors: findings.filter((finding) => finding.severity === "ERROR").length,
    warnings: findings.filter((finding) => finding.severity === "WARNING").length,
    lastUpdated: session.updatedAt,
    assignedImplementationUser: session.createdBy.fullName,
  };
}

function isStep(value: string): value is OnboardingStepKey {
  return (ONBOARDING_STEP_KEYS as readonly string[]).includes(value);
}

function readFindings(value: unknown): OnboardingFinding[] | null {
  if (!isRecord(value) || !Array.isArray(value.findings)) {
    return null;
  }
  return value.findings.filter(isFinding);
}

function readReadiness(value: unknown): ReadinessItem[] | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }
  return value.items.filter(isReadiness);
}

function isFinding(value: unknown): value is OnboardingFinding {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.area === "string" &&
    typeof value.message === "string" &&
    (value.severity === "PASS" || value.severity === "WARNING" || value.severity === "ERROR")
  );
}

function isReadiness(value: unknown): value is ReadinessItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.message === "string" &&
    typeof value.tested === "boolean" &&
    (value.status === "PASS" || value.status === "WARNING" || value.status === "FAIL" || value.status === "NOT_TESTED")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
