import { WeighbridgeProviderType } from "@prisma/client";
import {
  defaultConnectionType,
  isProviderType,
  rejectCredentialFields,
  validateHardwareConfig,
  type HardwareConfigInput,
  type SimulatorMode,
} from "../../domain/hardwareConfig.js";
import { HttpError } from "../../lib/httpError.js";

export function parseHardwarePatch(body: unknown): Partial<HardwareConfigInput> {
  const credentialError = rejectCredentialFields(body);
  if (credentialError) {
    throw new HttpError(400, credentialError);
  }
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Device configuration is required");
  }

  const record = body as Record<string, unknown>;
  const patch: Partial<HardwareConfigInput> = {};

  if (record.providerType !== undefined) {
    if (typeof record.providerType !== "string" || !isProviderType(record.providerType)) {
      throw new HttpError(400, "Unsupported provider type");
    }
    patch.providerType = record.providerType;
    patch.connectionType = defaultConnectionType(record.providerType);
  }
  if (typeof record.deviceName === "string") {
    patch.deviceName = record.deviceName.trim();
  }
  if (typeof record.deviceIdentifier === "string") {
    patch.deviceIdentifier = record.deviceIdentifier.trim();
  }
  if (typeof record.enabled === "boolean") {
    patch.enabled = record.enabled;
  }
  if (typeof record.unit === "string") {
    patch.unit = record.unit.trim().toUpperCase();
  }
  assignInteger(patch, record, "pollingIntervalMs");
  assignInteger(patch, record, "connectionTimeoutMs");
  assignInteger(patch, record, "healthTimeoutMs");
  assignInteger(patch, record, "reconnectDelayMs");
  assignInteger(patch, record, "maxReconnectAttempts");
  assignInteger(patch, record, "stabilityConsecutive");
  assignInteger(patch, record, "stabilityDurationMs");
  if (typeof record.reconnectEnabled === "boolean") {
    patch.reconnectEnabled = record.reconnectEnabled;
  }
  if (record.stabilityToleranceKg !== undefined) {
    patch.stabilityToleranceKg = decimalString(record.stabilityToleranceKg, "stability tolerance");
  }
  if (record.host !== undefined) {
    patch.host = optionalText(record.host, "host");
  }
  if (record.port !== undefined) {
    patch.port = optionalInteger(record.port, "port");
  }
  if (record.serialPort !== undefined) {
    patch.serialPort = optionalText(record.serialPort, "serial port");
  }
  if (record.baudRate !== undefined) {
    patch.baudRate = optionalInteger(record.baudRate, "baud rate");
  }
  if (record.dataBits !== undefined) {
    patch.dataBits = optionalInteger(record.dataBits, "data bits");
  }
  if (record.stopBits !== undefined) {
    patch.stopBits = optionalInteger(record.stopBits, "stop bits");
  }
  if (record.parity !== undefined) {
    patch.parity = optionalText(record.parity, "parity")?.toUpperCase();
  }
  if (record.protocol !== undefined) {
    patch.protocol = optionalText(record.protocol, "protocol");
  }
  if (record.modbusMapping !== undefined) {
    patch.modbusMapping = record.modbusMapping;
  }
  if (record.simulatorMode !== undefined) {
    if (typeof record.simulatorMode !== "string" || !isSimulatorMode(record.simulatorMode)) {
      throw new HttpError(400, "Simulator mode must be AUTO, STABLE, UNSTABLE, or DISCONNECTED");
    }
    patch.simulatorMode = record.simulatorMode;
  }
  if (record.simulatorBaseKg !== undefined) {
    patch.simulatorBaseKg = optionalText(record.simulatorBaseKg, "simulator base weight") ?? undefined;
  }

  return patch;
}

export function mergeHardwareConfig(
  current: HardwareConfigInput,
  patch: Partial<HardwareConfigInput>,
): HardwareConfigInput {
  const merged: HardwareConfigInput = {
    ...current,
    ...patch,
    connectionType: patch.providerType ? defaultConnectionType(patch.providerType) : current.connectionType,
  };
  const error = validateHardwareConfig(merged, merged.enabled);
  if (error) {
    throw new HttpError(400, error);
  }
  return merged;
}

export function prismaProvider(value: string): WeighbridgeProviderType {
  if (!isProviderType(value)) {
    throw new HttpError(400, "Unsupported provider type");
  }
  return value as WeighbridgeProviderType;
}

function isSimulatorMode(value: string): value is SimulatorMode {
  return value === "AUTO" || value === "STABLE" || value === "UNSTABLE" || value === "DISCONNECTED";
}

function assignInteger(
  target: Partial<HardwareConfigInput>,
  record: Record<string, unknown>,
  field: keyof HardwareConfigInput,
): void {
  if (record[field] === undefined) {
    return;
  }
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${String(field)} must be an integer`);
  }
  (target as Record<string, unknown>)[field] = value;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new HttpError(400, `${field} must be an integer`);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be text`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function decimalString(value: unknown, field: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(3);
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}
