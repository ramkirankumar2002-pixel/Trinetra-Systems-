import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";

function key(): Buffer {
  const material = env.integrationEncryptionKey !== "" ? env.integrationEncryptionKey : env.jwtSecret;
  if (material === "") {
    throw new HttpError(500, "Webhook encryption is not configured");
  }
  return createHash("sha256").update(`${material}:trinetra-webhook-secrets`).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new HttpError(500, "Stored webhook secret is unreadable");
  }
  const iv = Buffer.from(parts[0], "base64url");
  const encrypted = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
