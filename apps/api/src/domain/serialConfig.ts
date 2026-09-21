import { existsSync } from "node:fs";

export const SERIAL_BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200] as const;
export const SERIAL_DATA_BITS = [7, 8] as const;
export const SERIAL_STOP_BITS = [1, 2] as const;
export const SERIAL_PARITIES = ["NONE", "EVEN", "ODD"] as const;

export type SerialParity = (typeof SERIAL_PARITIES)[number];

export type SerialDeviceConfig = {
  serialPort: string;
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: SerialParity;
  readTimeoutMs: number;
  reconnectIntervalMs: number;
};

export type SerialAvailability = {
  available: boolean;
  reason: string | null;
};

export function isSerialParity(value: string): value is SerialParity {
  return (SERIAL_PARITIES as readonly string[]).includes(value);
}

export function validateSerialConfig(input: Partial<SerialDeviceConfig>): string | null {
  if (!input.serialPort || input.serialPort.trim() === "") {
    return "A serial port is required";
  }
  if (!isValidSerialPortName(input.serialPort.trim())) {
    return "A valid COM or /dev/tty serial port name is required";
  }
  if (input.baudRate === undefined || !SERIAL_BAUD_RATES.includes(input.baudRate as (typeof SERIAL_BAUD_RATES)[number])) {
    return "A documented baud rate is required";
  }
  if (input.dataBits === undefined || !SERIAL_DATA_BITS.includes(input.dataBits as (typeof SERIAL_DATA_BITS)[number])) {
    return "Data bits must be 7 or 8";
  }
  if (input.stopBits === undefined || !SERIAL_STOP_BITS.includes(input.stopBits as (typeof SERIAL_STOP_BITS)[number])) {
    return "Stop bits must be 1 or 2";
  }
  if (!input.parity || !isSerialParity(input.parity)) {
    return "Parity must be NONE, EVEN, or ODD";
  }
  if (
    input.readTimeoutMs === undefined ||
    !Number.isInteger(input.readTimeoutMs) ||
    input.readTimeoutMs < 100 ||
    input.readTimeoutMs > 60_000
  ) {
    return "Read timeout must be between 100 and 60000 milliseconds";
  }
  if (
    input.reconnectIntervalMs === undefined ||
    !Number.isInteger(input.reconnectIntervalMs) ||
    input.reconnectIntervalMs < 500 ||
    input.reconnectIntervalMs > 300_000
  ) {
    return "Reconnect interval must be between 500 and 300000 milliseconds";
  }
  return null;
}

export function isValidSerialPortName(port: string): boolean {
  return /^COM\d+$/i.test(port) || /^\/dev\/tty[A-Za-z0-9._-]+$/.test(port);
}

export function serialPortAvailability(port: string): SerialAvailability {
  if (!isValidSerialPortName(port)) {
    return { available: false, reason: "DEVICE NOT AVAILABLE" };
  }
  if (process.platform === "win32") {
    try {
      if (existsSync(`\\\\.\\${port}`)) {
        return { available: true, reason: null };
      }
    } catch {
      return { available: false, reason: "DEVICE NOT AVAILABLE" };
    }
    return { available: false, reason: "DEVICE NOT AVAILABLE" };
  }
  if (!existsSync(port)) {
    return { available: false, reason: "DEVICE NOT AVAILABLE" };
  }
  return { available: true, reason: null };
}
