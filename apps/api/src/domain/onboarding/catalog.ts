export const ONBOARDING_SESSION_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "READY_FOR_VALIDATION",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
] as const;
export type OnboardingSessionStatusValue = (typeof ONBOARDING_SESSION_STATUSES)[number];

export const ONBOARDING_STEP_KEYS = [
  "ORGANIZATION",
  "SITE",
  "DEPARTMENTS",
  "USERS",
  "WEIGHBRIDGE",
  "GATEWAY",
  "DEVICES",
  "MATERIALS",
  "WORKFLOWS",
  "DOCUMENTS",
  "UNLOADING",
  "NOTIFICATIONS",
  "VALIDATION",
  "PILOT_READINESS",
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export const ONBOARDING_STEP_STATES = ["COMPLETED", "CURRENT", "PENDING", "BLOCKED"] as const;
export type OnboardingStepState = (typeof ONBOARDING_STEP_STATES)[number];

export const ONBOARDING_FINDING_SEVERITIES = ["PASS", "WARNING", "ERROR"] as const;
export type OnboardingFindingSeverity = (typeof ONBOARDING_FINDING_SEVERITIES)[number];

export const GATEWAY_NOT_CONNECTED_MESSAGE = "GATEWAY NOT CONNECTED";

export const TYPICAL_DEPARTMENTS = [
  { code: "WEIGHBRIDGE", name: "Weighbridge" },
  { code: "STORE", name: "Store" },
  { code: "SITE", name: "Site" },
  { code: "PLANT", name: "Plant" },
  { code: "LAB", name: "Lab" },
  { code: "OFFICE", name: "Office" },
  { code: "OTHERS", name: "Others" },
] as const;

export const ONBOARDING_PERMISSIONS = [
  { code: "onboarding.view", name: "View customer onboarding", group: "onboarding" },
  { code: "onboarding.create", name: "Start customer onboarding", group: "onboarding" },
  { code: "onboarding.edit", name: "Edit customer onboarding", group: "onboarding" },
  { code: "onboarding.validate", name: "Validate customer onboarding", group: "onboarding" },
  { code: "onboarding.complete", name: "Complete customer onboarding", group: "onboarding" },
  { code: "onboarding.cancel", name: "Cancel customer onboarding", group: "onboarding" },
] as const;

export const ONBOARDING_PERMISSION_CODES = ONBOARDING_PERMISSIONS.map((permission) => permission.code);

export const IMPLEMENTATION_ENGINEER_PERMISSIONS = [
  ...ONBOARDING_PERMISSION_CODES,
  "user.read",
  "department.read",
  "material.read",
  "material.manage",
  "workflow.read",
  "workflow.manage",
  "weighbridge.read",
  "weighbridge.manage",
  "driver.mode",
  "camera.read",
  "camera.manage",
  "gateway.read",
  "gateway.manage",
  "hardware.pilot",
  "sync.read",
  "transaction.create",
  "transaction.read",
  "transaction.update",
  "weighment.record",
  "document.upload",
  "document.verify",
  "unloading.assign",
  "unloading.manage",
  "dashboard.read",
  "reliability.read",
  "monitoring.read",
  "support.ticket.create",
  "support.ticket.read",
  "support.ticket.comment",
  "support.ticket.manage",
  "support.internal",
  "support.maintenance.read",
  "support.maintenance.manage",
  "integration.read",
  "integration.manage",
] as const;

export const REQUIRED_OPERATIONAL_PERMISSIONS = [
  "transaction.create",
  "weighment.record",
  "approval.decide",
  "user.read",
] as const;

export const REQUIRED_NOTIFICATION_CATEGORIES = ["WORKFLOW", "APPROVAL", "EXCEPTION", "SYSTEM"] as const;

export function isOnboardingSessionStatus(value: string): value is OnboardingSessionStatusValue {
  return (ONBOARDING_SESSION_STATUSES as readonly string[]).includes(value);
}

export function isOnboardingStepKey(value: string): value is OnboardingStepKey {
  return (ONBOARDING_STEP_KEYS as readonly string[]).includes(value);
}

export function onboardingStepLabel(step: OnboardingStepKey): string {
  switch (step) {
    case "ORGANIZATION":
      return "Organization";
    case "SITE":
      return "Site";
    case "DEPARTMENTS":
      return "Departments";
    case "USERS":
      return "Users";
    case "WEIGHBRIDGE":
      return "Weighbridge";
    case "GATEWAY":
      return "Gateway";
    case "DEVICES":
      return "Devices";
    case "MATERIALS":
      return "Materials";
    case "WORKFLOWS":
      return "Workflows";
    case "DOCUMENTS":
      return "Documents";
    case "UNLOADING":
      return "Unloading";
    case "NOTIFICATIONS":
      return "Notifications";
    case "VALIDATION":
      return "Validation";
    case "PILOT_READINESS":
      return "Pilot Readiness";
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}

export function isTerminalOnboardingStatus(status: OnboardingSessionStatusValue): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function isOpenOnboardingStatus(status: OnboardingSessionStatusValue): boolean {
  return status === "DRAFT" || status === "IN_PROGRESS" || status === "READY_FOR_VALIDATION" || status === "BLOCKED";
}
