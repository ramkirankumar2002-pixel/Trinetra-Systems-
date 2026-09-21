import { EdgeDeviceType, WeighbridgeProviderType } from "@prisma/client";
import { isDriverLocale } from "../../domain/driverConfig.js";
import { isAllowedDocumentType, normalizeDocumentType } from "../../domain/documentTypes.js";
import { isEdgeDeviceType } from "../../domain/edgeTypes.js";
import { isOnboardingStepKey, type OnboardingStepKey } from "../../domain/onboarding/catalog.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";

export type CreateOnboardingInput = {
  siteId?: string | undefined;
  notes?: string | undefined;
};

export type OrganizationStepInput = {
  name: string;
  code: string;
  contactName?: string | undefined;
  contactEmail?: string | undefined;
  defaultLanguage: string;
  languages: string[];
  timezone?: string | undefined;
  voiceEnabled: boolean;
  audioEnabled: boolean;
};

export type SiteStepInput = {
  name: string;
  code: string;
  location?: string | undefined;
  timezone: string;
};

export type DepartmentStepInput = {
  selectedDepartmentIds: string[];
};

export type UserStepInput = {
  fullName: string;
  email: string;
  roleId: string;
  departmentId?: string | undefined;
  siteId?: string | undefined;
  weighbridgeId?: string | undefined;
};

export type WeighbridgeStepInput = {
  name: string;
  code: string;
  capacityKg?: number | undefined;
  unit: string;
  hardwareMode: WeighbridgeProviderType;
};

export type GatewayStepInput = {
  name: string;
  code: string;
};

export type DeviceStepInput = {
  deviceType: EdgeDeviceType;
  name: string;
  code: string;
  manufacturer?: string | undefined;
  model?: string | undefined;
  interfaceType?: string | undefined;
  provider?: string | undefined;
  protocol?: string | undefined;
  gatewayId: string;
  weighbridgeId?: string | undefined;
  cameraId?: string | undefined;
};

export type MaterialStepInput = {
  name: string;
  code: string;
  isActive: boolean;
  unitOfMeasure?: string | undefined;
  workflowDefinitionId?: string | undefined;
};

export type WorkflowStepInput = {
  workflowId: string;
  publish: boolean;
};

export type DocumentStepInput = {
  documentTypeCodes: string[];
};

export type UnloadingStepInput = {
  name: string;
  code: string;
};

export type NotificationStepInput = {
  userId: string;
  categories: string[];
};

export type ValidationStepInput = {
  acceptedWarningKeys: string[];
};

export type ApplyStepInput = {
  step: OnboardingStepKey;
  complete: boolean;
  payload: Record<string, unknown>;
};

export function parseCreateOnboardingInput(body: unknown): CreateOnboardingInput {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Onboarding details are required");
  }
  const record = body as Record<string, unknown>;
  const siteId = optionalId(record.siteId);
  const notes = optionalText(record.notes);
  return {
    ...(siteId === undefined ? {} : { siteId }),
    ...(notes === undefined ? {} : { notes }),
  };
}

export function parseApplyStepInput(body: unknown): ApplyStepInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Step details are required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.step !== "string" || !isOnboardingStepKey(record.step)) {
    throw new HttpError(400, "A valid onboarding step is required");
  }
  return {
    step: record.step,
    complete: record.complete === true,
    payload:
      typeof record.payload === "object" && record.payload !== null
        ? (record.payload as Record<string, unknown>)
        : {},
  };
}

export function parseOrganizationStep(payload: Record<string, unknown>): OrganizationStepInput {
  const languages = parseLanguages(payload.languages ?? payload.enabledDriverLanguages);
  const defaultLanguage = requiredText(payload.defaultLanguage ?? "en", "default language").toLowerCase();
  if (!isDriverLocale(defaultLanguage)) {
    throw new HttpError(400, "Default language is not supported");
  }
  if (!languages.includes(defaultLanguage)) {
    languages.unshift(defaultLanguage);
  }
  const contactEmail = optionalText(payload.contactEmail);
  if (contactEmail !== undefined && !contactEmail.includes("@")) {
    throw new HttpError(400, "Contact email is invalid");
  }
  return {
    name: requiredText(payload.name, "organization name"),
    code: normalizeSlug(requiredText(payload.code ?? payload.slug, "organization code")),
    defaultLanguage,
    languages,
    voiceEnabled: payload.voiceEnabled !== false,
    audioEnabled: payload.audioEnabled !== false,
    ...(optionalText(payload.contactName) === undefined ? {} : { contactName: optionalText(payload.contactName) }),
    ...(contactEmail === undefined ? {} : { contactEmail }),
    ...(optionalText(payload.timezone) === undefined ? {} : { timezone: optionalText(payload.timezone) }),
  };
}

export function parseSiteStep(payload: Record<string, unknown>): SiteStepInput {
  return {
    name: requiredText(payload.name, "site name"),
    code: normalizeCode(requiredText(payload.code, "site code")),
    timezone: optionalText(payload.timezone) ?? "Asia/Kolkata",
    ...(optionalText(payload.location) === undefined ? {} : { location: optionalText(payload.location) }),
  };
}

export function parseDepartmentStep(payload: Record<string, unknown>): DepartmentStepInput {
  const ids = parseIdList(payload.selectedDepartmentIds ?? payload.departmentIds);
  return { selectedDepartmentIds: ids };
}

export function parseUserStep(payload: Record<string, unknown>): UserStepInput {
  const email = requiredText(payload.email, "login identity").toLowerCase();
  if (!email.includes("@")) {
    throw new HttpError(400, "Login identity must be an email address");
  }
  return {
    fullName: requiredText(payload.fullName ?? payload.name, "name"),
    email,
    roleId: requiredText(payload.roleId, "role"),
    ...(optionalId(payload.departmentId) === undefined ? {} : { departmentId: optionalId(payload.departmentId) }),
    ...(optionalId(payload.siteId) === undefined ? {} : { siteId: optionalId(payload.siteId) }),
    ...(optionalId(payload.weighbridgeId) === undefined ? {} : { weighbridgeId: optionalId(payload.weighbridgeId) }),
  };
}

export function parseWeighbridgeStep(payload: Record<string, unknown>): WeighbridgeStepInput {
  const hardwareMode = typeof payload.hardwareMode === "string" ? payload.hardwareMode.toUpperCase() : "SIMULATOR";
  if (!isProvider(hardwareMode)) {
    throw new HttpError(400, "Unsupported hardware mode");
  }
  if (hardwareMode !== "SIMULATOR") {
    throw new HttpError(400, "Protocol information required");
  }
  const capacity = payload.capacityKg;
  let capacityKg: number | undefined;
  if (capacity !== undefined && capacity !== null && capacity !== "") {
    const parsed = Number(capacity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new HttpError(400, "Capacity must be a positive number");
    }
    capacityKg = parsed;
  }
  return {
    name: requiredText(payload.name, "weighbridge name"),
    code: normalizeCode(requiredText(payload.code, "weighbridge code")),
    unit: optionalText(payload.unit)?.toUpperCase() ?? "KG",
    hardwareMode,
    ...(capacityKg === undefined ? {} : { capacityKg }),
  };
}

export function parseGatewayStep(payload: Record<string, unknown>): GatewayStepInput {
  return {
    name: requiredText(payload.name, "gateway name"),
    code: normalizeCode(requiredText(payload.code, "gateway identity")),
  };
}

export function parseDeviceStep(payload: Record<string, unknown>): DeviceStepInput {
  if (typeof payload.deviceType !== "string" || !isEdgeDeviceType(payload.deviceType)) {
    throw new HttpError(400, "Unsupported device type");
  }
  const provider = optionalText(payload.provider)?.toUpperCase() ?? "SIMULATOR";
  if (provider !== "SIMULATOR" && !optionalText(payload.protocol)) {
    throw new HttpError(400, "Protocol information required");
  }
  return {
    deviceType: payload.deviceType,
    name: requiredText(payload.name, "device name"),
    code: normalizeCode(requiredText(payload.code, "device code")),
    gatewayId: requiredText(payload.gatewayId, "gateway"),
    provider,
    ...(optionalText(payload.manufacturer) === undefined ? {} : { manufacturer: optionalText(payload.manufacturer) }),
    ...(optionalText(payload.model) === undefined ? {} : { model: optionalText(payload.model) }),
    ...(optionalText(payload.interfaceType ?? payload.connectionType) === undefined
      ? {}
      : { interfaceType: optionalText(payload.interfaceType ?? payload.connectionType) }),
    ...(optionalText(payload.protocol) === undefined ? {} : { protocol: optionalText(payload.protocol) }),
    ...(optionalId(payload.weighbridgeId) === undefined ? {} : { weighbridgeId: optionalId(payload.weighbridgeId) }),
    ...(optionalId(payload.cameraId) === undefined ? {} : { cameraId: optionalId(payload.cameraId) }),
  };
}

export function parseMaterialStep(payload: Record<string, unknown>): MaterialStepInput {
  return {
    name: requiredText(payload.name, "material name"),
    code: normalizeCode(requiredText(payload.code, "material code")),
    isActive: payload.isActive !== false,
    ...(optionalText(payload.unitOfMeasure) === undefined ? {} : { unitOfMeasure: optionalText(payload.unitOfMeasure) }),
    ...(optionalId(payload.workflowDefinitionId ?? payload.workflowId) === undefined
      ? {}
      : { workflowDefinitionId: optionalId(payload.workflowDefinitionId ?? payload.workflowId) }),
  };
}

export function parseWorkflowStep(payload: Record<string, unknown>): WorkflowStepInput {
  return {
    workflowId: requiredText(payload.workflowId ?? payload.id, "workflow"),
    publish: payload.publish !== false,
  };
}

export function parseDocumentStep(payload: Record<string, unknown>): DocumentStepInput {
  const raw = payload.documentTypeCodes ?? payload.codes;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "At least one document type is required");
  }
  const codes = raw.map((item) => {
    if (typeof item !== "string") {
      throw new HttpError(400, "Document type codes must be text");
    }
    const code = normalizeDocumentType(item);
    if (!isAllowedDocumentType(code, env.documentTypes)) {
      throw new HttpError(400, `Document type ${code} is not in the configured catalog`);
    }
    return code;
  });
  return { documentTypeCodes: [...new Set(codes)] };
}

export function parseUnloadingStep(payload: Record<string, unknown>): UnloadingStepInput {
  return {
    name: requiredText(payload.name, "unloading point name"),
    code: normalizeCode(requiredText(payload.code, "unloading point code")),
  };
}

export function parseNotificationStep(payload: Record<string, unknown>): NotificationStepInput {
  const categories = parseIdList(payload.categories);
  if (categories.length === 0) {
    throw new HttpError(400, "At least one notification category is required");
  }
  return {
    userId: requiredText(payload.userId, "recipient"),
    categories,
  };
}

export function parseValidationStep(payload: Record<string, unknown>): ValidationStepInput {
  return {
    acceptedWarningKeys: parseIdList(payload.acceptedWarningKeys ?? payload.acceptedWarnings),
  };
}

export function parseNotes(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  return optionalText((body as Record<string, unknown>).notes);
}

function parseLanguages(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    return ["en"];
  }
  const languages = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(isDriverLocale);
  if (languages.length === 0) {
    throw new HttpError(400, "At least one supported driver language is required");
  }
  return [...new Set(languages)];
}

function parseIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => item !== ""),
    ),
  ];
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A ${field} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalId(value: unknown): string | undefined {
  return optionalText(value);
}

function normalizeCode(value: string): string {
  const code = value.trim().toUpperCase().replace(/[\s]+/g, "-");
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) {
    throw new HttpError(400, "Code must be 2–40 letters, numbers, dashes, or underscores");
  }
  return code;
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[\s]+/g, "-");
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) {
    throw new HttpError(400, "Organization code must be 2–40 letters, numbers, or dashes");
  }
  return slug;
}

function isProvider(value: string): value is WeighbridgeProviderType {
  return (Object.values(WeighbridgeProviderType) as string[]).includes(value);
}
