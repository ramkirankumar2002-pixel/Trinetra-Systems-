import type { WeighbridgeProviderType } from "@prisma/client";
import { parseModbusMapping } from "./modbusMapping.js";
import { stabilityConfigFromKg } from "./stability.js";
import { isWeightUnit } from "./weightUnits.js";

export const PROVIDER_TYPES = ["SIMULATOR", "SERIAL", "TCP", "MODBUS_RTU", "MODBUS_TCP"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const SIMULATOR_MODES = ["AUTO", "STABLE", "UNSTABLE", "DISCONNECTED"] as const;
export type SimulatorMode = (typeof SIMULATOR_MODES)[number];

export const SERIAL_PARITIES = ["NONE", "EVEN", "ODD"] as const;

const CREDENTIAL_KEYS = ["password", "secret", "token", "apiKey", "apikey", "credential", "username"];

export type HardwareConfigInput = {
  providerType: ProviderType;
  connectionType: string;
  deviceName: string;
  deviceIdentifier: string;
  enabled: boolean;
  unit: string;
  pollingIntervalMs: number;
  connectionTimeoutMs: number;
  healthTimeoutMs: number;
  reconnectEnabled: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  stabilityToleranceKg: string;
  stabilityConsecutive: number;
  stabilityDurationMs: number;
  host?: string | undefined;
  port?: number | undefined;
  serialPort?: string | undefined;
  baudRate?: number | undefined;
  dataBits?: number | undefined;
  stopBits?: number | undefined;
  parity?: string | undefined;
  protocol?: string | undefined;
  modbusMapping?: unknown;
  simulatorMode: SimulatorMode;
  simulatorBaseKg?: string | undefined;
};

export function isProviderType(value: string): value is ProviderType {
  return (PROVIDER_TYPES as readonly string[]).includes(value);
}

export function defaultConnectionType(providerType: ProviderType): string {
  switch (providerType) {
    case "SIMULATOR":
      return "NONE";
    case "SERIAL":
    case "MODBUS_RTU":
      return "SERIAL";
    case "TCP":
      return "TCP";
    case "MODBUS_TCP":
      return "MODBUS_TCP";
    default: {
      const _exhaustive: never = providerType;
      return _exhaustive;
    }
  }
}

export function rejectCredentialFields(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const keys = Object.keys(body as Record<string, unknown>).map((key) => key.toLowerCase());
  const found = keys.find((key) => CREDENTIAL_KEYS.includes(key));
  return found ? "Device credentials are not stored. Remove credential fields from the request." : null;
}

export function validateHardwareConfig(input: HardwareConfigInput, requireConnectionFields: boolean): string | null {
  if (input.deviceName.trim() === "" || input.deviceIdentifier.trim() === "") {
    return "Device name and identifier are required";
  }
  if (!isWeightUnit(input.unit)) {
    return "Unit must be KG or TONNE";
  }
  if (!inRange(input.pollingIntervalMs, 200, 10_000)) {
    return "Polling interval must be between 200 and 10000 milliseconds";
  }
  if (!inRange(input.connectionTimeoutMs, 250, 30_000)) {
    return "Connection timeout must be between 250 and 30000 milliseconds";
  }
  if (!inRange(input.healthTimeoutMs, 1000, 120_000)) {
    return "Health timeout must be between 1000 and 120000 milliseconds";
  }
  if (!inRange(input.reconnectDelayMs, 500, 60_000)) {
    return "Reconnect delay must be between 500 and 60000 milliseconds";
  }
  if (!inRange(input.maxReconnectAttempts, 0, 20)) {
    return "Max reconnect attempts must be between 0 and 20";
  }

  const stability = stabilityConfigFromKg({
    toleranceKg: input.stabilityToleranceKg,
    consecutiveReadings: input.stabilityConsecutive,
    durationMs: input.stabilityDurationMs,
  });
  if (typeof stability === "string") {
    return stability;
  }

  if (!requireConnectionFields) {
    return validateProviderSpecific(input, false);
  }
  return validateProviderSpecific(input, true);
}

export function validateProviderSpecific(input: HardwareConfigInput, enabled: boolean): string | null {
  switch (input.providerType) {
    case "SIMULATOR":
      return null;
    case "TCP":
      return enabled ? requireTcp(input) : null;
    case "SERIAL":
      return enabled ? requireSerial(input) : null;
    case "MODBUS_TCP": {
      if (!enabled) {
        return null;
      }
      const tcp = requireTcp(input);
      if (tcp) {
        return tcp;
      }
      return mappingError(input.modbusMapping);
    }
    case "MODBUS_RTU": {
      if (!enabled) {
        return null;
      }
      const serial = requireSerial(input);
      if (serial) {
        return serial;
      }
      return mappingError(input.modbusMapping);
    }
    default: {
      const _exhaustive: never = input.providerType;
      return _exhaustive;
    }
  }
}

export function providerTypeFromPrisma(value: WeighbridgeProviderType): ProviderType {
  return value;
}

function requireTcp(input: HardwareConfigInput): string | null {
  if (!input.host || input.host.trim() === "") {
    return "Host or IP is required for this connection type";
  }
  if (input.host.trim() === "0.0.0.0" || input.host.trim() === "*") {
    return "A specific host is required. Network scanning is not supported.";
  }
  if (input.port === undefined || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return "A TCP port between 1 and 65535 is required";
  }
  return null;
}

function requireSerial(input: HardwareConfigInput): string | null {
  if (!input.serialPort || input.serialPort.trim() === "") {
    return "A serial port is required for this connection type";
  }
  if (input.baudRate === undefined || !Number.isInteger(input.baudRate) || input.baudRate < 300) {
    return "A baud rate is required for serial connections";
  }
  if (input.parity !== undefined && !(SERIAL_PARITIES as readonly string[]).includes(input.parity)) {
    return "Parity must be NONE, EVEN, or ODD";
  }
  return null;
}

function mappingError(mapping: unknown): string | null {
  const parsed = parseModbusMapping(mapping);
  return typeof parsed === "string" ? parsed : null;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}
