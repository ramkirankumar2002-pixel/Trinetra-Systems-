import type { EventPriority } from "../queue/types.js";

const RANK: Record<EventPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function priorityForEventType(eventType: string): EventPriority {
  switch (eventType) {
    case "DEVICE_WEIGHT_READING":
    case "LOCAL_TRANSACTION_CREATED":
    case "LOCAL_TRANSACTION_STATE":
      return "CRITICAL";
    case "DEVICE_ANPR_DETECTION":
    case "DEVICE_SCAN_COMPLETED":
    case "LOCAL_FILE_CAPTURED":
    case "LOCAL_WEIGHT_ANOMALY":
      return "HIGH";
    case "DEVICE_STATUS_CHANGED":
    case "CONNECTIVITY_CHANGED":
      return "NORMAL";
    default:
      return "LOW";
  }
}

export function compareQueuedEvents<T extends {
  priority: EventPriority;
  eventTimestamp: string;
  sequence?: string | null;
  receivedAt: string;
}>(left: T, right: T): number {
  const byPriority = RANK[left.priority] - RANK[right.priority];
  if (byPriority !== 0) {
    return byPriority;
  }
  const leftSeq = left.sequence ? Number(left.sequence) : Number.NaN;
  const rightSeq = right.sequence ? Number(right.sequence) : Number.NaN;
  if (Number.isFinite(leftSeq) && Number.isFinite(rightSeq) && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }
  const byTime = Date.parse(left.eventTimestamp) - Date.parse(right.eventTimestamp);
  if (byTime !== 0) {
    return byTime;
  }
  return Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
}
