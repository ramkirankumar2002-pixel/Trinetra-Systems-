import { ApprovalDecision } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";
import { normalizeApprovalComment, validateRejectionReason } from "../../domain/approvalState.js";

export function parseApprovalStatusFilter(value: unknown): ApprovalDecision | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "Invalid approval status");
  }

  const allowed = Object.values(ApprovalDecision);
  if (!allowed.includes(value as ApprovalDecision)) {
    throw new HttpError(400, "Invalid approval status");
  }

  return value as ApprovalDecision;
}

export function parseApproveInput(body: unknown): { comments: string | null } {
  if (body === undefined || body === null || (typeof body === "object" && Object.keys(body as object).length === 0)) {
    return { comments: null };
  }
  if (typeof body !== "object") {
    throw new HttpError(400, "Invalid approval payload");
  }

  const record = body as Record<string, unknown>;
  return { comments: normalizeApprovalComment(record.comments) };
}

export function parseRejectInput(body: unknown): { reason: string } {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A rejection reason is required");
  }

  const record = body as Record<string, unknown>;
  const reason = typeof record.reason === "string" ? record.reason : record.comments;
  const error = validateRejectionReason(reason);
  if (error) {
    throw new HttpError(400, error);
  }

  return { reason: String(reason).trim() };
}

export function parseOptionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a date`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${field} must be a valid date`);
  }

  return parsed;
}
