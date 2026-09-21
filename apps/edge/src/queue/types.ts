import type { EdgeEventEnvelope } from "../events/envelope.js";

export const QUEUE_STATUSES = ["PENDING", "SYNCING", "SYNCED", "FAILED", "DEAD_LETTER"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const EVENT_PRIORITIES = ["CRITICAL", "HIGH", "NORMAL", "LOW"] as const;
export type EventPriority = (typeof EVENT_PRIORITIES)[number];

export type QueuedEdgeEvent = {
  eventId: string;
  gatewayId: string;
  deviceId: string;
  eventType: string;
  payload: EdgeEventEnvelope;
  eventTimestamp: string;
  receivedAt: string;
  status: QueueStatus;
  retryCount: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  syncedAt: string | null;
  failureReason: string | null;
  firstFailureAt: string | null;
  priority: EventPriority;
  sequence: string | null;
  localTransactionId: string | null;
  dependsOn: string[];
  payloadHash: string | null;
  recommendedAction: string | null;
};

export type QueueStats = {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  deadLetter: number;
};

export function isQueueStatus(value: string): value is QueueStatus {
  return (QUEUE_STATUSES as readonly string[]).includes(value);
}
