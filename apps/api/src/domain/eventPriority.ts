export const EVENT_PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export type EventPriority = (typeof EVENT_PRIORITIES)[number];

const PRIORITY_RANK: Record<EventPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export function isEventPriority(value: string): value is EventPriority {
  return (EVENT_PRIORITIES as readonly string[]).includes(value);
}

export function priorityRank(priority: EventPriority): number {
  return PRIORITY_RANK[priority];
}

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

export function compareSyncOrder<T extends {
  priority: EventPriority;
  eventTimestamp: string;
  sequence?: string | null;
  receivedAt: string;
}>(left: T, right: T): number {
  const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
  if (byPriority !== 0) {
    return byPriority;
  }
  const leftSeq = parseSequence(left.sequence);
  const rightSeq = parseSequence(right.sequence);
  if (leftSeq !== null && rightSeq !== null && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }
  const byEventTime = Date.parse(left.eventTimestamp) - Date.parse(right.eventTimestamp);
  if (byEventTime !== 0) {
    return byEventTime;
  }
  return Date.parse(left.receivedAt) - Date.parse(right.receivedAt);
}

function parseSequence(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
