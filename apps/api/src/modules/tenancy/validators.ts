import { HttpError } from "../../lib/httpError.js";
import { isOrganizationStatus, isSiteStatus } from "../../domain/tenancy/lifecycle.js";

export function parseOrganizationStatusInput(body: unknown): { status: "ACTIVE" | "SUSPENDED" } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Organization status is required");
  }
  const record = body as Record<string, unknown>;
  if (record.status !== "ACTIVE" && record.status !== "SUSPENDED") {
    throw new HttpError(400, "Organization status must be ACTIVE or SUSPENDED");
  }
  if (!isOrganizationStatus(record.status)) {
    throw new HttpError(400, "Organization status must be ACTIVE or SUSPENDED");
  }
  return { status: record.status };
}

export function parseSiteStatusInput(body: unknown): { status: "ACTIVE" | "INACTIVE" } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Site status is required");
  }
  const record = body as Record<string, unknown>;
  if (record.status !== "ACTIVE" && record.status !== "INACTIVE") {
    throw new HttpError(400, "Site status must be ACTIVE or INACTIVE");
  }
  if (!isSiteStatus(record.status)) {
    throw new HttpError(400, "Site status must be ACTIVE or INACTIVE");
  }
  return { status: record.status };
}
