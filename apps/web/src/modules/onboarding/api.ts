import { apiRequest } from "../../shared/api/client.ts";

export type OnboardingStepState = "COMPLETED" | "CURRENT" | "PENDING" | "BLOCKED";

export type OnboardingStepProgress = {
  key: string;
  label: string;
  index: number;
  state: OnboardingStepState;
};

export type OnboardingFinding = {
  key: string;
  area: string;
  severity: "PASS" | "WARNING" | "ERROR";
  message: string;
};

export type ReadinessItem = {
  key: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL" | "NOT_TESTED";
  message: string;
  tested: boolean;
};

export type PublicOnboardingSession = {
  id: string;
  organization: { id: string; name: string; slug: string; status: string; kind: string };
  site: { id: string; code: string; name: string; status: string; timezone: string } | null;
  createdBy: { id: string; fullName: string; email: string };
  createdAt: string;
  updatedAt: string;
  currentStep: string;
  currentStepLabel: string;
  status: string;
  completionPercent: number;
  notes: string | null;
  steps: OnboardingStepProgress[];
  completedSteps: string[];
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
  status: string;
  blockingErrors: number;
  warnings: number;
  lastUpdated: string;
  assignedImplementationUser: string;
};

export type OnboardingCatalog = {
  typicalDepartments: Array<{ code: string; name: string }>;
  languages: string[];
  documentTypes: Array<{ code: string; label: string }>;
  notificationCategories: string[];
  organization: {
    id: string;
    name: string;
    slug: string;
    contactName: string | null;
    contactEmail: string | null;
    defaultLanguage: string;
    enabledDriverLanguages: string[];
    driverVoiceEnabled: boolean;
    driverAudioEnabled: boolean;
    documentTypeCodes: string[];
  } | null;
  sites: Array<{ id: string; code: string; name: string; timezone: string; location: string | null; status: string }>;
  departments: Array<{ id: string; code: string; name: string }>;
  roles: Array<{ id: string; code: string; name: string }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    site: string | null;
    department: string | null;
    roles: string[];
  }>;
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string; isActive: boolean }>;
  gateways: Array<{ id: string; code: string; name: string; status: string; lastHeartbeatAt: string | null }>;
  materials: Array<{ id: string; code: string; name: string; isActive: boolean }>;
  workflows: Array<{ id: string; code: string; name: string; isActive: boolean; version: string; status: string }>;
  unloadingPoints: Array<{ id: string; code: string; name: string; isActive: boolean }>;
};

export function listOnboardingSessions() {
  return apiRequest<{ items: OnboardingDashboardRow[] }>("/api/v1/onboarding");
}

export function createOnboardingSession(siteId?: string) {
  return apiRequest<{ session: PublicOnboardingSession }>("/api/v1/onboarding", {
    method: "POST",
    body: JSON.stringify(siteId ? { siteId } : {}),
  });
}

export function getOnboardingSession(id: string) {
  return apiRequest<{ session: PublicOnboardingSession; catalog: OnboardingCatalog }>(`/api/v1/onboarding/${id}`);
}

export function applyOnboardingStep(id: string, step: string, complete: boolean, payload: Record<string, unknown> = {}) {
  return apiRequest<{
    session: PublicOnboardingSession;
    issuedCredential?: string;
    temporaryPassword?: string;
    validation?: { findings: OnboardingFinding[]; errorCount: number; warningCount: number };
    readiness?: { items: ReadinessItem[] };
  }>(`/api/v1/onboarding/${id}/step`, {
    method: "PATCH",
    body: JSON.stringify({ step, complete, payload }),
  });
}

export function validateOnboarding(id: string) {
  return apiRequest<{ session: PublicOnboardingSession; validation: { findings: OnboardingFinding[] } }>(
    `/api/v1/onboarding/${id}/validate`,
    { method: "POST" },
  );
}

export function runHardwareChecks(id: string) {
  return apiRequest<{ session: PublicOnboardingSession; hardware: Record<string, unknown> }>(
    `/api/v1/onboarding/${id}/hardware-checks`,
    { method: "POST" },
  );
}

export function runReadiness(id: string) {
  return apiRequest<{ session: PublicOnboardingSession; readiness: { items: ReadinessItem[] } }>(
    `/api/v1/onboarding/${id}/readiness`,
    { method: "POST" },
  );
}

export function runPilotTest(id: string) {
  return apiRequest<{ transaction: { id: string; referenceNumber: string; operationMode: string } }>(
    `/api/v1/onboarding/${id}/pilot-test`,
    { method: "POST" },
  );
}

export function completeOnboarding(id: string) {
  return apiRequest<{ session: PublicOnboardingSession }>(`/api/v1/onboarding/${id}/complete`, { method: "POST" });
}

export function cancelOnboarding(id: string) {
  return apiRequest<{ session: PublicOnboardingSession }>(`/api/v1/onboarding/${id}/cancel`, { method: "POST" });
}

export function findingTone(severity: string): string {
  switch (severity) {
    case "PASS":
      return "pass";
    case "WARNING":
      return "warning";
    case "ERROR":
      return "error";
    default:
      return "pending";
  }
}

export function containsSecret(value: string): boolean {
  return /password|credential|tgw_|secret|hash/i.test(value);
}
