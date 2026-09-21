import { EdgeDeviceType, HardwareDeviceStatus } from "@prisma/client";
import { isEdgeDeviceType } from "../../domain/edgeTypes.js";
import { rejectSecretFields } from "../../domain/edgeSecrets.js";
import { HttpError } from "../../lib/httpError.js";

export type CreateGatewayInput = {
  siteId: string;
  code: string;
  name: string;
};

export type UpdateDeviceInput = {
  name?: string | undefined;
  manufacturer?: string | null | undefined;
  model?: string | null | undefined;
  serialNumber?: string | null | undefined;
  protocol?: string | null | undefined;
  connectionType?: string | null | undefined;
  provider?: string | undefined;
  weighbridgeId?: string | null | undefined;
  cameraId?: string | null | undefined;
  enabled?: boolean | undefined;
  configurationRef?: Record<string, unknown> | null | undefined;
  firmwareVersion?: string | null | undefined;
  notes?: string | null | undefined;
  host?: string | null | undefined;
  port?: number | null | undefined;
  serialPort?: string | null | undefined;
  adapterKey?: string | null | undefined;
  protocolReadiness?: string | undefined;
  installationStatus?: string | undefined;
};

export type CreateDeviceInput = UpdateDeviceInput & {
  deviceType: EdgeDeviceType;
  code: string;
  name: string;
};

export type HeartbeatInput = {
  softwareVersion: string | null;
  buildEnvironment: string | null;
  platform: string | null;
  status: "ONLINE" | "DEGRADED" | "OFFLINE" | "SYNCING" | "RECOVERING" | "ERROR";
  connectedDeviceCount: number;
  snapshot?: Record<string, unknown> | undefined;
  devices: Array<{
    deviceId: string;
    status: HardwareDeviceStatus;
    lastCommunicationAt: string | null;
    lastError: string | null;
    lastReadingSummary?: Record<string, unknown> | undefined;
    lastDiagnostic?: Record<string, unknown> | undefined;
  }>;
};

export function parseCreateGatewayInput(body: unknown): CreateGatewayInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Gateway details are required");
  }
  const record = body as Record<string, unknown>;
  return {
    siteId: requiredText(record.siteId, "site"),
    code: requiredCode(record.code, "gateway code"),
    name: requiredText(record.name, "gateway name"),
  };
}

export function parseCreateDeviceInput(body: unknown): CreateDeviceInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Device details are required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.deviceType !== "string" || !isEdgeDeviceType(record.deviceType)) {
    throw new HttpError(400, "Unsupported device type");
  }
  return {
    ...parseUpdateDeviceInput(record),
    deviceType: record.deviceType as EdgeDeviceType,
    code: requiredCode(record.code, "device code"),
    name: requiredText(record.name, "device name"),
  };
}

export function parseUpdateDeviceInput(body: unknown): UpdateDeviceInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Device details are required");
  }
  const record = body as Record<string, unknown>;
  const configurationRef =
    record.configurationRef === undefined
      ? undefined
      : record.configurationRef === null
        ? null
        : asSafeObject(record.configurationRef, "configuration");

  return {
    ...(typeof record.name === "string" ? { name: requiredText(record.name, "device name") } : {}),
    ...(record.manufacturer === undefined
      ? {}
      : { manufacturer: optionalText(record.manufacturer, "manufacturer") }),
    ...(record.model === undefined ? {} : { model: optionalText(record.model, "model") }),
    ...(record.serialNumber === undefined
      ? {}
      : { serialNumber: optionalText(record.serialNumber, "serial number") }),
    ...(record.protocol === undefined ? {} : { protocol: optionalText(record.protocol, "protocol") }),
    ...(record.connectionType === undefined
      ? {}
      : { connectionType: optionalText(record.connectionType, "connection type") }),
    ...(typeof record.provider === "string" ? { provider: requiredText(record.provider, "provider") } : {}),
    ...(record.weighbridgeId === undefined
      ? {}
      : { weighbridgeId: optionalId(record.weighbridgeId, "weighbridge") }),
    ...(record.cameraId === undefined ? {} : { cameraId: optionalId(record.cameraId, "camera") }),
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
    ...(configurationRef === undefined ? {} : { configurationRef }),
    ...(record.firmwareVersion === undefined
      ? {}
      : { firmwareVersion: optionalText(record.firmwareVersion, "firmware version") }),
    ...(record.notes === undefined ? {} : { notes: optionalText(record.notes, "notes") }),
    ...(record.host === undefined ? {} : { host: optionalText(record.host, "host") }),
    ...(record.port === undefined
      ? {}
      : {
          port:
            record.port === null
              ? null
              : typeof record.port === "number" && Number.isInteger(record.port)
                ? record.port
                : (() => {
                    throw new HttpError(400, "A valid port is required");
                  })(),
        }),
    ...(record.serialPort === undefined ? {} : { serialPort: optionalText(record.serialPort, "serial port") }),
    ...(record.adapterKey === undefined ? {} : { adapterKey: optionalText(record.adapterKey, "adapter") }),
    ...(typeof record.protocolReadiness === "string" ? { protocolReadiness: record.protocolReadiness } : {}),
    ...(typeof record.installationStatus === "string" ? { installationStatus: record.installationStatus } : {}),
  };
}

export function parseHeartbeatInput(body: unknown): HeartbeatInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Heartbeat details are required");
  }
  const record = body as Record<string, unknown>;
  const status =
    record.status === "DEGRADED" ||
    record.status === "OFFLINE" ||
    record.status === "SYNCING" ||
    record.status === "RECOVERING" ||
    record.status === "ERROR"
      ? record.status
      : "ONLINE";
  const devices = Array.isArray(record.devices) ? record.devices : [];
  return {
    softwareVersion: optionalText(record.softwareVersion, "software version"),
    buildEnvironment: optionalText(record.buildEnvironment, "build environment"),
    platform: optionalText(record.platform, "platform"),
    status,
    ...(isRecord(record.snapshot) ? { snapshot: record.snapshot } : {}),
    connectedDeviceCount:
      typeof record.connectedDeviceCount === "number" && Number.isInteger(record.connectedDeviceCount)
        ? record.connectedDeviceCount
        : devices.filter((device) => isHeartbeatDevice(device) && device.status === "CONNECTED").length,
    devices: devices.filter(isHeartbeatDevice).map((device) => ({
      deviceId: device.deviceId,
      status: device.status,
      lastCommunicationAt:
        typeof device.lastCommunicationAt === "string" ? device.lastCommunicationAt : null,
      lastError: typeof device.lastError === "string" ? device.lastError : null,
      ...(isRecord(device.lastReadingSummary)
        ? { lastReadingSummary: device.lastReadingSummary }
        : {}),
      ...(isRecord(device.lastDiagnostic) ? { lastDiagnostic: device.lastDiagnostic } : {}),
    })),
  };
}

function isHeartbeatDevice(value: unknown): value is {
  deviceId: string;
  status: HardwareDeviceStatus;
  lastCommunicationAt?: string | null;
  lastError?: string | null;
  lastReadingSummary?: Record<string, unknown>;
  lastDiagnostic?: Record<string, unknown>;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.deviceId === "string" &&
    record.deviceId !== "" &&
    typeof record.status === "string" &&
    Object.values(HardwareDeviceStatus).includes(record.status as HardwareDeviceStatus)
  );
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A ${field} is required`);
  }
  return value.trim();
}

function requiredCode(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,47}$/.test(text)) {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  return text;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  return value.trim();
}

function optionalId(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  return value;
}

function asSafeObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  const secretError = rejectSecretFields(value);
  if (secretError) {
    throw new HttpError(400, secretError);
  }
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
