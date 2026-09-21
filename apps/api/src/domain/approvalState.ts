import { ApprovalDecision } from "@prisma/client";

const ALLOWED: Record<ApprovalDecision, ApprovalDecision[]> = {
  [ApprovalDecision.PENDING]: [
    ApprovalDecision.APPROVED,
    ApprovalDecision.REJECTED,
    ApprovalDecision.CANCELLED,
    ApprovalDecision.HOLD,
  ],
  [ApprovalDecision.HOLD]: [
    ApprovalDecision.PENDING,
    ApprovalDecision.APPROVED,
    ApprovalDecision.REJECTED,
    ApprovalDecision.CANCELLED,
  ],
  [ApprovalDecision.APPROVED]: [],
  [ApprovalDecision.REJECTED]: [],
  [ApprovalDecision.CANCELLED]: [],
};

export function canTransitionApproval(from: ApprovalDecision, to: ApprovalDecision): boolean {
  return ALLOWED[from].includes(to);
}

export function assertPendingDecision(current: ApprovalDecision): string | null {
  if (current !== ApprovalDecision.PENDING) {
    return "Approval is no longer pending.";
  }
  return null;
}

export function validateRejectionReason(reason: unknown): string | null {
  if (typeof reason !== "string" || reason.trim().length < 3) {
    return "A rejection reason is required";
  }
  if (reason.trim().length > 500) {
    return "Rejection reason must be 500 characters or fewer";
  }
  return null;
}

export function normalizeApprovalComment(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function hasActiveApprovalForStep(
  approvals: Array<{ snapshotStepSortOrder: number; decision: ApprovalDecision }>,
  sortOrder: number,
): boolean {
  return approvals.some(
    (approval) => approval.snapshotStepSortOrder === sortOrder && approval.decision === ApprovalDecision.PENDING,
  );
}

export function applyApprovalDecision(
  current: ApprovalDecision,
  next: ApprovalDecision,
): { ok: true } | { ok: false; error: string } {
  if (current !== ApprovalDecision.PENDING) {
    return { ok: false, error: "Approval is no longer pending." };
  }
  if (!canTransitionApproval(current, next)) {
    return { ok: false, error: "Approval is no longer pending." };
  }
  return { ok: true };
}
