const JWT_PLACEHOLDER = "replace-with-a-long-random-string";
const MIN_PRODUCTION_JWT_LENGTH = 32;
const DEFAULT_SESSION_SECONDS = 8 * 60 * 60;

export function parseCorsOrigins(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function isCorsOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) {
    return true;
  }
  if (allowed.includes("*")) {
    return true;
  }
  return allowed.includes(origin);
}

export function corsProductionIssue(origins: string[], production: boolean): string | null {
  if (production && (origins.length === 0 || origins.includes("*"))) {
    return "CORS_ORIGIN cannot be empty or * in production";
  }
  return null;
}

export function jwtSecretIssue(secret: string, production: boolean): string | null {
  if (secret === "") {
    return "JWT_SECRET is required";
  }
  if (production && (secret === JWT_PLACEHOLDER || secret.length < MIN_PRODUCTION_JWT_LENGTH)) {
    return "JWT_SECRET must be a long random value of at least 32 characters in production";
  }
  return null;
}

export function isPlaceholderJwtSecret(secret: string): boolean {
  return secret === "" || secret === JWT_PLACEHOLDER;
}

export function parseExpiresInSeconds(value: string): number | null {
  const match = /^(\d+)(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!match?.[1]) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) {
    return null;
  }
  const unit = (match[2] ?? "s").toLowerCase();
  switch (unit) {
    case "ms":
      return Math.max(1, Math.floor(amount / 1000));
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 3600;
    case "d":
      return amount * 86400;
    default:
      return null;
  }
}

export function sessionTtlSeconds(value: string, production: boolean): number {
  const parsed = parseExpiresInSeconds(value);
  if (parsed !== null && parsed <= 7 * 24 * 60 * 60) {
    return parsed;
  }
  if (production && parsed === null) {
    throw new Error("JWT_EXPIRES_IN must be a duration such as 8h or 3600s");
  }
  return DEFAULT_SESSION_SECONDS;
}

export function jwtExpiresIssue(value: string, production: boolean): string | null {
  const parsed = parseExpiresInSeconds(value);
  if (parsed === null) {
    return production ? "JWT_EXPIRES_IN must be a duration such as 8h or 3600s" : null;
  }
  if (production && parsed > 7 * 24 * 60 * 60) {
    return "JWT_EXPIRES_IN cannot exceed 7 days in production";
  }
  return null;
}
