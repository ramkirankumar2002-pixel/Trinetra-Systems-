import {
  defaultCameraConnectionType,
  isAnprProviderType,
  isCameraConnectionType,
  isCameraProviderType,
  isCameraPurpose,
  isCameraSimulatorScenario,
  rejectCameraCredentialFields,
  sanitizeConfiguredUrl,
  validateCameraConfig,
  type CameraConfigInput,
} from "../../domain/cameraConfig.js";
import { HttpError } from "../../lib/httpError.js";

export function parseCameraCreate(body: unknown): CameraConfigInput & { weighbridgeId: string } {
  const credentialError = rejectCameraCredentialFields(body);
  if (credentialError) {
    throw new HttpError(400, credentialError);
  }
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Camera configuration is required");
  }
  const record = body as Record<string, unknown>;
  const weighbridgeId = requiredText(record.weighbridgeId, "weighbridge");
  const provider = optionalProvider(record.cameraProviderType) ?? "SIMULATOR";
  const input: CameraConfigInput = {
    name: requiredText(record.name, "name"),
    cameraIdentifier: requiredText(record.cameraIdentifier ?? record.name, "camera identifier"),
    purpose: optionalPurpose(record.purpose) ?? "ENTRY_ANPR",
    cameraProviderType: provider,
    connectionType: optionalConnection(record.connectionType) ?? defaultCameraConnectionType(provider),
    anprProviderType: optionalAnprProvider(record.anprProviderType) ?? "SIMULATOR",
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    highConfidenceMin: optionalUnit(record.highConfidenceMin) ?? 0.9,
    mediumConfidenceMin: optionalUnit(record.mediumConfidenceMin) ?? 0.7,
    simulatorScenario: optionalScenario(record.simulatorScenario) ?? "HIGH_KNOWN",
    ...(optionalDirection(record.direction) ? { direction: optionalDirection(record.direction) } : {}),
    ...(sanitizeConfiguredUrl(optionalText(record.snapshotUrl))
      ? { snapshotUrl: sanitizeConfiguredUrl(optionalText(record.snapshotUrl)) ?? undefined }
      : {}),
    ...(sanitizeConfiguredUrl(optionalText(record.streamUrl))
      ? { streamUrl: sanitizeConfiguredUrl(optionalText(record.streamUrl)) ?? undefined }
      : {}),
  };
  const error = validateCameraConfig(input);
  if (error) {
    throw new HttpError(400, error);
  }
  return { ...input, weighbridgeId };
}

export function parseCameraPatch(body: unknown): Partial<CameraConfigInput> {
  const credentialError = rejectCameraCredentialFields(body);
  if (credentialError) {
    throw new HttpError(400, credentialError);
  }
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Camera configuration is required");
  }
  const record = body as Record<string, unknown>;
  const patch: Partial<CameraConfigInput> = {};
  if (record.name !== undefined) {
    patch.name = requiredText(record.name, "name");
  }
  if (record.cameraIdentifier !== undefined) {
    patch.cameraIdentifier = requiredText(record.cameraIdentifier, "camera identifier");
  }
  if (record.purpose !== undefined) {
    patch.purpose = optionalPurpose(record.purpose) ?? "ENTRY_ANPR";
  }
  if (record.cameraProviderType !== undefined) {
    const provider = optionalProvider(record.cameraProviderType);
    if (!provider) {
      throw new HttpError(400, "Unsupported camera provider");
    }
    patch.cameraProviderType = provider;
    patch.connectionType = defaultCameraConnectionType(provider);
  }
  if (record.connectionType !== undefined) {
    const connection = optionalConnection(record.connectionType);
    if (!connection) {
      throw new HttpError(400, "Unsupported camera connection type");
    }
    patch.connectionType = connection;
  }
  if (record.anprProviderType !== undefined) {
    const provider = optionalAnprProvider(record.anprProviderType);
    if (!provider) {
      throw new HttpError(400, "Unsupported ANPR provider");
    }
    patch.anprProviderType = provider;
  }
  if (typeof record.enabled === "boolean") {
    patch.enabled = record.enabled;
  }
  if (record.direction !== undefined) {
    patch.direction = optionalDirection(record.direction);
  }
  if (record.snapshotUrl !== undefined) {
    patch.snapshotUrl = sanitizeConfiguredUrl(optionalText(record.snapshotUrl)) ?? undefined;
  }
  if (record.streamUrl !== undefined) {
    patch.streamUrl = sanitizeConfiguredUrl(optionalText(record.streamUrl)) ?? undefined;
  }
  if (record.highConfidenceMin !== undefined) {
    patch.highConfidenceMin = optionalUnit(record.highConfidenceMin) ?? 0.9;
  }
  if (record.mediumConfidenceMin !== undefined) {
    patch.mediumConfidenceMin = optionalUnit(record.mediumConfidenceMin) ?? 0.7;
  }
  if (record.simulatorScenario !== undefined) {
    const scenario = optionalScenario(record.simulatorScenario);
    if (!scenario) {
      throw new HttpError(400, "Unsupported simulator scenario");
    }
    patch.simulatorScenario = scenario;
  }
  return patch;
}

export function parseRecognizeInput(body: unknown): { scenario?: string | undefined } {
  if (body === undefined || body === null || body === "") {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Invalid recognize payload");
  }
  const record = body as Record<string, unknown>;
  if (record.scenario === undefined) {
    return {};
  }
  if (typeof record.scenario !== "string" || !isCameraSimulatorScenario(record.scenario)) {
    throw new HttpError(400, "Unsupported simulator scenario");
  }
  return { scenario: record.scenario };
}

export function parseCorrectInput(body: unknown): { plate: string; reason?: string | undefined } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Correction payload is required");
  }
  const record = body as Record<string, unknown>;
  const plate = requiredText(record.plate ?? record.registrationNumber, "vehicle number");
  const reason = optionalText(record.reason);
  return reason ? { plate, reason } : { plate };
}

export function parseManualInput(body: unknown): { plate: string } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Manual identification payload is required");
  }
  const record = body as Record<string, unknown>;
  return { plate: requiredText(record.plate ?? record.registrationNumber, "vehicle number") };
}

export function parseConfirmInput(body: unknown): { vehicleId: string; transactionId?: string | undefined } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Confirmation payload is required");
  }
  const record = body as Record<string, unknown>;
  const vehicleId = requiredText(record.vehicleId, "vehicle");
  const transactionId = optionalText(record.transactionId);
  return transactionId ? { vehicleId, transactionId } : { vehicleId };
}

export function parseRejectInput(body: unknown): { reason?: string | undefined } {
  if (body === undefined || body === null || body === "") {
    return {};
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Invalid reject payload");
  }
  const reason = optionalText((body as Record<string, unknown>).reason);
  return reason ? { reason } : {};
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${label} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "Invalid text value");
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function optionalPurpose(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isCameraPurpose(value)) {
    throw new HttpError(400, "Unsupported camera purpose");
  }
  return value;
}

function optionalProvider(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isCameraProviderType(value)) {
    throw new HttpError(400, "Unsupported camera provider");
  }
  return value;
}

function optionalConnection(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isCameraConnectionType(value)) {
    throw new HttpError(400, "Unsupported camera connection type");
  }
  return value;
}

function optionalAnprProvider(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isAnprProviderType(value)) {
    throw new HttpError(400, "Unsupported ANPR provider");
  }
  return value;
}

function optionalScenario(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || !isCameraSimulatorScenario(value)) {
    return undefined;
  }
  return value;
}

function optionalDirection(value: unknown): string | undefined {
  const text = optionalText(value);
  return text ? text.toUpperCase() : undefined;
}

function optionalUnit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new HttpError(400, "Confidence threshold must be between 0 and 1");
  }
  return parsed;
}
