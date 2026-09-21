import { createHmac, timingSafeEqual } from "node:crypto";

export function webhookSignedPayload(timestamp: string, eventId: string, rawBody: string): string {
  return `${timestamp}.${eventId}.${rawBody}`;
}

export function signWebhookPayload(secret: string, timestamp: string, eventId: string, rawBody: string): string {
  const digest = createHmac("sha256", secret)
    .update(webhookSignedPayload(timestamp, eventId, rawBody))
    .digest("hex");
  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  const expected = signWebhookPayload(secret, timestamp, eventId, rawBody);
  const provided = Buffer.from(signatureHeader);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length) {
    return false;
  }
  return timingSafeEqual(provided, wanted);
}

export function webhookTimestampIsFresh(timestamp: string, nowMs: number, maxSkewMs = 5 * 60 * 1000): boolean {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed)) {
    return false;
  }
  return Math.abs(nowMs - parsed) <= maxSkewMs;
}
