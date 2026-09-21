export const CAMERA_PURPOSES = ["ENTRY_ANPR", "EXIT_ANPR", "GENERAL_MONITORING"] as const;
export type CameraPurposeValue = (typeof CAMERA_PURPOSES)[number];

export const CAMERA_CONNECTION_TYPES = ["SIMULATOR", "RTSP", "HTTP_SNAPSHOT", "LOCAL"] as const;
export type CameraConnectionTypeValue = (typeof CAMERA_CONNECTION_TYPES)[number];

export const CAMERA_PROVIDER_TYPES = ["SIMULATOR", "RTSP", "HTTP_SNAPSHOT", "LOCAL"] as const;
export type CameraProviderTypeValue = (typeof CAMERA_PROVIDER_TYPES)[number];

export const ANPR_PROVIDER_TYPES = ["SIMULATOR"] as const;
export type AnprProviderTypeValue = (typeof ANPR_PROVIDER_TYPES)[number];

export const CAMERA_SIMULATOR_SCENARIOS = [
  "HIGH_KNOWN",
  "MEDIUM_KNOWN",
  "LOW",
  "UNKNOWN",
  "NO_PLATE",
  "MULTI_CANDIDATE",
] as const;
export type CameraSimulatorScenario = (typeof CAMERA_SIMULATOR_SCENARIOS)[number];

const CREDENTIAL_KEYS = ["password", "secret", "token", "apiKey", "apikey", "credential", "username"];

export type CameraConfigInput = {
  name: string;
  cameraIdentifier: string;
  purpose: CameraPurposeValue;
  cameraProviderType: CameraProviderTypeValue;
  connectionType: CameraConnectionTypeValue;
  anprProviderType: AnprProviderTypeValue;
  enabled: boolean;
  direction?: string | undefined;
  snapshotUrl?: string | undefined;
  streamUrl?: string | undefined;
  highConfidenceMin: number;
  mediumConfidenceMin: number;
  simulatorScenario: CameraSimulatorScenario;
};

export function isCameraPurpose(value: string): value is CameraPurposeValue {
  return (CAMERA_PURPOSES as readonly string[]).includes(value);
}

export function isCameraConnectionType(value: string): value is CameraConnectionTypeValue {
  return (CAMERA_CONNECTION_TYPES as readonly string[]).includes(value);
}

export function isCameraProviderType(value: string): value is CameraProviderTypeValue {
  return (CAMERA_PROVIDER_TYPES as readonly string[]).includes(value);
}

export function isAnprProviderType(value: string): value is AnprProviderTypeValue {
  return (ANPR_PROVIDER_TYPES as readonly string[]).includes(value);
}

export function isCameraSimulatorScenario(value: string): value is CameraSimulatorScenario {
  return (CAMERA_SIMULATOR_SCENARIOS as readonly string[]).includes(value);
}

export function defaultCameraConnectionType(provider: CameraProviderTypeValue): CameraConnectionTypeValue {
  return provider;
}

export function rejectCameraCredentialFields(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  for (const key of CREDENTIAL_KEYS) {
    if (key in record && record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return "Camera credentials cannot be submitted through this API";
    }
  }
  return null;
}

export function sanitizeConfiguredUrl(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.username !== "" || parsed.password !== "") {
      parsed.username = "";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function publicConfiguredUrl(value: string | null | undefined): string | null {
  const sanitized = sanitizeConfiguredUrl(value);
  return sanitized === null && value !== undefined && value !== null && value.trim() !== ""
    ? "[configured]"
    : sanitized;
}

export function validateCameraConfig(input: CameraConfigInput): string | null {
  if (input.name.trim() === "") {
    return "Camera name is required";
  }
  if (input.cameraIdentifier.trim() === "") {
    return "Camera identifier is required";
  }
  if (input.cameraProviderType === "SIMULATOR" && input.connectionType !== "SIMULATOR") {
    return "Simulator cameras must use the simulator connection type";
  }
  if (input.cameraProviderType !== "SIMULATOR" && input.connectionType === "SIMULATOR") {
    return "Physical camera providers cannot use the simulator connection type";
  }
  if (input.highConfidenceMin < 0 || input.highConfidenceMin > 1 || input.mediumConfidenceMin < 0 || input.mediumConfidenceMin > 1) {
    return "Confidence thresholds must be between 0 and 1";
  }
  if (input.mediumConfidenceMin > input.highConfidenceMin) {
    return "Medium confidence threshold cannot be higher than the high threshold";
  }
  if (input.connectionType === "RTSP" || input.connectionType === "HTTP_SNAPSHOT") {
    if (!input.snapshotUrl && !input.streamUrl) {
      return "An explicit snapshot or stream URL is required for this connection type";
    }
  }
  return null;
}
