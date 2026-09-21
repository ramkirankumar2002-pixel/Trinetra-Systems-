export const CONFLICTING_CENTRAL_STATUSES = ["REJECTED", "CANCELLED", "EXCEPTION"] as const;

export type SyncConflictInput = {
  localState: string;
  centralStatus: string | null;
};

export type SyncConflictAssessment = {
  conflict: boolean;
  reason: string | null;
  recommendedAction: string | null;
};

export function assessSyncConflict(input: SyncConflictInput): SyncConflictAssessment {
  if (input.centralStatus === null) {
    return { conflict: false, reason: null, recommendedAction: null };
  }
  const localCompleted = input.localState === "LOCAL_COMPLETED" || input.localState === "CENTRAL_COMPLETED";
  const centralBlocks = (CONFLICTING_CENTRAL_STATUSES as readonly string[]).includes(input.centralStatus);
  if (localCompleted && centralBlocks) {
    return {
      conflict: true,
      reason: `Edge recorded local completion while the central transaction is ${input.centralStatus}.`,
      recommendedAction:
        "Do not overwrite either state. An authorized supervisor must inspect the visit and apply a correction through the existing audit workflow.",
    };
  }
  if (input.localState === "PAUSED_APPROVAL" && input.centralStatus === "COMPLETED") {
    return {
      conflict: true,
      reason: "Edge paused the visit for approval while the central transaction is already COMPLETED.",
      recommendedAction: "Inspect both records. Do not automatically reopen or close the visit.",
    };
  }
  return { conflict: false, reason: null, recommendedAction: null };
}
