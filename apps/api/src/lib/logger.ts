import { env } from "../config/env.js";

const SENSITIVE_KEY = /password|passwd|token|secret|authorization|cookie|credential|jwt|session|apikey|api_key|private[_-]?key/i;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length > 0 && looksLikeSecret(value)) {
      return "[redacted]";
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      next[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(nested);
    }
    return next;
  }

  return value;
}

export function writeLog(level: LogLevel, event: string, fields: LogFields = {}): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[env.logLevel]) {
    return;
  }

  const redacted = redactValue(fields) as LogFields;
  const { service, correlationId, requestId, ...rest } = redacted;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: typeof service === "string" ? service : "trinetra-api",
    event,
    ...(typeof requestId === "string" ? { requestId } : {}),
    ...(typeof correlationId === "string"
      ? { correlationId }
      : typeof requestId === "string"
        ? { correlationId: requestId }
        : {}),
    ...rest,
  });

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function looksLikeSecret(value: string): boolean {
  if (value.startsWith("eyJ") && value.includes(".")) {
    return true;
  }
  if (
    value.startsWith("tgw_") ||
    value.startsWith("tsk_") ||
    value.startsWith("tapp_") ||
    value.startsWith("whsec_") ||
    value.startsWith("Bearer ")
  ) {
    return true;
  }
  if (value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$")) {
    return true;
  }
  return false;
}
