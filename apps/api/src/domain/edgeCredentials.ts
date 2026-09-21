import { randomBytes } from "node:crypto";
import { sha256 } from "../lib/crypto.js";

const CREDENTIAL_PREFIX = "tgw_";

export const GATEWAY_AUTH_METHODS = ["SHARED_CREDENTIAL", "MUTUAL_TLS"] as const;
export type GatewayAuthMethod = (typeof GATEWAY_AUTH_METHODS)[number];

/** Current gateways authenticate with a hashed shared credential. Mutual TLS is a future extension. */
export const CURRENT_GATEWAY_AUTH_METHOD: GatewayAuthMethod = "SHARED_CREDENTIAL";

export type FutureMutualTlsGatewayIdentity = {
  method: "MUTUAL_TLS";
  certificateFingerprint: string;
  gatewayId: string;
};

export function generateGatewayCredential(): string {
  return `${CREDENTIAL_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function hashGatewayCredential(credential: string): string {
  return sha256(credential.trim());
}

export function isGatewayCredentialFormat(value: string): boolean {
  return value.startsWith(CREDENTIAL_PREFIX) && value.length >= CREDENTIAL_PREFIX.length + 32;
}
