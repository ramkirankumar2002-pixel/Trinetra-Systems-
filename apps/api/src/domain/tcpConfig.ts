export type TcpDeviceConfig = {
  host: string;
  port: number;
  timeoutMs: number;
  reconnectIntervalMs: number;
};

const BLOCKED_HOSTS = new Set(["0.0.0.0", "255.255.255.255", "*", "localhost.", ""]);

export function validateTcpConfig(input: Partial<TcpDeviceConfig>): string | null {
  if (!input.host || input.host.trim() === "") {
    return "A host is required";
  }
  const host = input.host.trim();
  if (BLOCKED_HOSTS.has(host.toLowerCase()) || host.includes("*") || host.includes(" ")) {
    return "Only an explicitly configured host may be used";
  }
  if (!isExplicitHost(host)) {
    return "Only an explicitly configured host may be used";
  }
  if (input.port === undefined || !Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
    return "A TCP port between 1 and 65535 is required";
  }
  if (
    input.timeoutMs === undefined ||
    !Number.isInteger(input.timeoutMs) ||
    input.timeoutMs < 100 ||
    input.timeoutMs > 60_000
  ) {
    return "Timeout must be between 100 and 60000 milliseconds";
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

export function isExplicitHost(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host.split(".").every((octet) => {
      const value = Number(octet);
      return Number.isInteger(value) && value >= 0 && value <= 255;
    });
  }
  return /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host);
}
