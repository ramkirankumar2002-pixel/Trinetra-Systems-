const DEFAULT_MAX_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_PAST_MS = 10 * 365 * 24 * 60 * 60 * 1000;

export type ResolvedEventTimestamp = {
  recordedAt: Date;
  clockIssue: string | null;
  usedGatewayReceipt: boolean;
  deviceEventTime: Date | null;
  gatewayReceiveTime: Date;
};

export function parseClockInstant(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveEventTimestamp(input: {
  deviceEventTime: string | number | Date | null | undefined;
  gatewayReceiveTime: string | number | Date;
  nowMs: number;
  maxSkewMs?: number;
}): ResolvedEventTimestamp {
  const maxSkewMs = input.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  const gatewayReceiveTime = parseClockInstant(input.gatewayReceiveTime) ?? new Date(input.nowMs);
  const deviceEventTime =
    input.deviceEventTime === null || input.deviceEventTime === undefined
      ? null
      : parseClockInstant(input.deviceEventTime);

  if (deviceEventTime === null) {
    return {
      recordedAt: gatewayReceiveTime,
      clockIssue: "Device timestamp is missing or invalid; gateway receipt time is used.",
      usedGatewayReceipt: true,
      deviceEventTime: null,
      gatewayReceiveTime,
    };
  }

  const skew = deviceEventTime.getTime() - input.nowMs;
  if (skew > maxSkewMs) {
    return {
      recordedAt: gatewayReceiveTime,
      clockIssue: "Device timestamp is too far in the future; gateway receipt time is used.",
      usedGatewayReceipt: true,
      deviceEventTime,
      gatewayReceiveTime,
    };
  }
  if (input.nowMs - deviceEventTime.getTime() > MAX_PAST_MS) {
    return {
      recordedAt: gatewayReceiveTime,
      clockIssue: "Device timestamp is too far in the past; gateway receipt time is used.",
      usedGatewayReceipt: true,
      deviceEventTime,
      gatewayReceiveTime,
    };
  }

  return {
    recordedAt: deviceEventTime,
    clockIssue: null,
    usedGatewayReceipt: false,
    deviceEventTime,
    gatewayReceiveTime,
  };
}
