import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "../../lib/httpError.js";

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) {
    return false;
  }
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function ipv4FromMappedIpv6(hostname: string): string | null {
  const normalized = hostname.toLowerCase();
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (dotted?.[1]) {
    return dotted[1];
  }
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (!hex?.[1] || !hex[2]) {
    return null;
  }
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  if (!Number.isInteger(high) || !Number.isInteger(low)) {
    return null;
  }
  return `${(high >> 8) & 255}.${high & 255}.${(low >> 8) & 255}.${low & 255}`;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  const mapped = ipv4FromMappedIpv6(normalized);
  if (mapped) {
    return isPrivateIpv4(mapped);
  }
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
}

export function isBlockedWebhookHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTS.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized.endsWith(".local") || normalized.endsWith(".internal")) {
    return true;
  }
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }
  return false;
}

export function parseWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "Webhook URL is invalid");
  }
  if (url.username !== "" || url.password !== "") {
    throw new HttpError(400, "Webhook URL must not include credentials");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new HttpError(400, "Webhook URL must use http or https");
  }
  return url;
}

export function assertWebhookDestination(raw: string, allowPrivateTargets: boolean): URL {
  const url = parseWebhookUrl(raw);
  if (!allowPrivateTargets && url.protocol !== "https:") {
    throw new HttpError(400, "Webhook URL must use HTTPS");
  }
  if (!allowPrivateTargets && isBlockedWebhookHost(url.hostname)) {
    throw new HttpError(400, "Webhook URL target is not allowed");
  }
  return url;
}

export async function assertResolvedWebhookDestination(raw: string, allowPrivateTargets: boolean): Promise<URL> {
  const url = assertWebhookDestination(raw, allowPrivateTargets);
  if (allowPrivateTargets) {
    return url;
  }
  if (isIP(url.hostname) !== 0) {
    return url;
  }
  try {
    const resolved = await lookup(url.hostname, { all: false });
    if (isBlockedWebhookHost(resolved.address)) {
      throw new HttpError(400, "Webhook URL target is not allowed");
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Webhook URL target is not allowed");
  }
  return url;
}
