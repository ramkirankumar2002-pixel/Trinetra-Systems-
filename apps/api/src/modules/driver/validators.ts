import { HttpError } from "../../lib/httpError.js";
import { isDriverAuditAction, type DriverAuditAction } from "../../domain/driverAudit.js";

export type DriverEventInput = {
  action: DriverAuditAction;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export function parseDriverEventInput(body: unknown): DriverEventInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A driver event is required");
  }

  const record = body as Record<string, unknown>;
  if (typeof record.action !== "string" || !isDriverAuditAction(record.action)) {
    throw new HttpError(400, "That driver action is not allowed");
  }

  const entityType = typeof record.entityType === "string" && record.entityType.trim() !== ""
    ? record.entityType.trim()
    : "DriverMode";
  const entityId = typeof record.entityId === "string" && record.entityId.trim() !== ""
    ? record.entityId.trim()
    : "session";

  return {
    action: record.action,
    entityType,
    entityId,
    ...(isMetadata(record.metadata) ? { metadata: record.metadata } : {}),
  };
}

function isMetadata(value: unknown): value is Record<string, string | number | boolean | null> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
}
