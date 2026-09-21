import type { EdgeEventEnvelope } from "../events/envelope.js";
import { LocalStore } from "../store/localStore.js";
import type { EnqueueOptions } from "../store/types.js";
import type { QueuedEdgeEvent, QueueStatus } from "./types.js";

export class FileEventQueue {
  readonly store: LocalStore;

  constructor(filePathOrStore: string | LocalStore) {
    this.store = typeof filePathOrStore === "string" ? new LocalStore(filePathOrStore) : filePathOrStore;
  }

  async enqueue(envelope: EdgeEventEnvelope, options: EnqueueOptions = {}): Promise<QueuedEdgeEvent> {
    return this.store.enqueue(envelope, options);
  }

  async listByStatus(...statuses: QueueStatus[]): Promise<QueuedEdgeEvent[]> {
    return this.store.listByStatus(...statuses);
  }

  async update(
    eventId: string,
    patch: Partial<
      Pick<
        QueuedEdgeEvent,
        | "status"
        | "retryCount"
        | "lastAttemptAt"
        | "nextRetryAt"
        | "syncedAt"
        | "failureReason"
        | "firstFailureAt"
        | "recommendedAction"
      >
    > &
      Partial<Pick<QueuedEdgeEvent, never>> & {
        lastAttempt?: string;
        lastError?: string | null;
      },
  ): Promise<QueuedEdgeEvent | null> {
    const { lastAttempt, lastError, ...rest } = patch;
    return this.store.update(eventId, {
      ...rest,
      ...(lastAttempt === undefined ? {} : { lastAttemptAt: lastAttempt }),
      ...(lastError === undefined ? {} : { failureReason: lastError }),
    });
  }

  async get(eventId: string): Promise<QueuedEdgeEvent | null> {
    return this.store.get(eventId);
  }

  async stats() {
    return this.store.stats();
  }
}
