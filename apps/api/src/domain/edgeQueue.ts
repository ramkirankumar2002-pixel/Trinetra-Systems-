export const EDGE_QUEUE_STATUSES = ["PENDING", "SYNCING", "SYNCED", "FAILED", "DEAD_LETTER"] as const;
export type EdgeQueueStatusValue = (typeof EDGE_QUEUE_STATUSES)[number];

export function isEdgeQueueStatus(value: string): value is EdgeQueueStatusValue {
  return (EDGE_QUEUE_STATUSES as readonly string[]).includes(value);
}

export const SYNC_ACK_STATUSES = [
  "ACCEPTED",
  "ALREADY_PROCESSED",
  "CONFLICT",
  "REJECTED",
  "DEPENDENCY_PENDING",
] as const;
export type SyncAckStatus = (typeof SYNC_ACK_STATUSES)[number];

export function isSyncAckStatus(value: string): value is SyncAckStatus {
  return (SYNC_ACK_STATUSES as readonly string[]).includes(value);
}

export function isSuccessfulAck(status: SyncAckStatus): boolean {
  return status === "ACCEPTED" || status === "ALREADY_PROCESSED";
}
