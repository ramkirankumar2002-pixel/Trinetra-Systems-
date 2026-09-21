import { randomBytes } from "node:crypto";
import { sha256 } from "../../lib/crypto.js";
import type { IntegrationEnvironmentValue } from "./catalog.js";

const TEST_PREFIX = "tsk_test_";
const LIVE_PREFIX = "tsk_live_";
const CLIENT_PREFIX = "tapp_";

export function generateIntegrationClientId(): string {
  return `${CLIENT_PREFIX}${randomBytes(12).toString("hex")}`;
}

export function generateIntegrationSecret(environment: IntegrationEnvironmentValue): string {
  const prefix = environment === "PRODUCTION" ? LIVE_PREFIX : TEST_PREFIX;
  return `${prefix}${randomBytes(32).toString("hex")}`;
}

export function hashIntegrationSecret(secret: string): string {
  return sha256(secret.trim());
}

export function isIntegrationSecretFormat(value: string): boolean {
  return (
    (value.startsWith(TEST_PREFIX) || value.startsWith(LIVE_PREFIX)) &&
    value.length >= TEST_PREFIX.length + 32
  );
}

export function secretPrefix(secret: string): string {
  return secret.slice(0, 12);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

export function isWebhookSecretFormat(value: string): boolean {
  return value.startsWith("whsec_") && value.length >= 38;
}
