const LOCAL_ID_PATTERN = /^[A-Z0-9]{2,16}-\d{8}-\d{6}$/;

export function normalizeGatewayCodeForLocalId(code: string): string {
  const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const trimmed = compact.slice(0, 16);
  if (trimmed.length >= 2) {
    return trimmed;
  }
  return `EDGE${trimmed.padEnd(2, "0")}`;
}

export function formatLocalTransactionId(input: {
  gatewayCode: string;
  dayUtc: string;
  sequence: number;
}): string {
  const gateway = normalizeGatewayCodeForLocalId(input.gatewayCode);
  const day = input.dayUtc.replaceAll("-", "").slice(0, 8);
  const sequence = String(Math.max(1, Math.floor(input.sequence))).padStart(6, "0");
  return `${gateway}-${day}-${sequence}`;
}

export function utcDayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function isLocalTransactionId(value: string): boolean {
  return LOCAL_ID_PATTERN.test(value);
}

export function localTransactionIdCollisionKey(gatewayId: string, localTransactionId: string): string {
  return `${gatewayId}:${localTransactionId}`;
}
