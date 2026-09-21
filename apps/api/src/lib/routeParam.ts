import { HttpError } from "./httpError.js";

const MAX_ROUTE_ID_LENGTH = 128;
const SAFE_ROUTE_ID = /^[A-Za-z0-9_-]+$/;

export function isSafeRouteId(value: string): boolean {
  if (value === "" || value.length > MAX_ROUTE_ID_LENGTH) {
    return false;
  }
  if (value.includes("..") || /[\\/\0]/.test(value)) {
    return false;
  }
  return SAFE_ROUTE_ID.test(value);
}

export function routeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  const id = raw.trim();
  if (!isSafeRouteId(id)) {
    throw new HttpError(400, "Invalid identifier");
  }
  return id;
}
