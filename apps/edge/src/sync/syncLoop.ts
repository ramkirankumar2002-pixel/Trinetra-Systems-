import { readFile } from "node:fs/promises";
import { edgeEnv } from "../config/env.js";
import type { ConnectivityManager } from "../connectivity/manager.js";
import { nextRetryDelayMs, shouldRetry } from "../core/backoff.js";
import type { EdgeLogger } from "../core/logger.js";
import { BackendUnavailableError, GatewayAuthError, type GatewayClient, type SyncAck } from "../gateway/client.js";
import { compareQueuedEvents } from "../offline/priority.js";
import type { FileEventQueue } from "../queue/fileQueue.js";
import type { QueuedEdgeEvent } from "../queue/types.js";
export class SyncLoop {
  private paused = false;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private connectivity: ConnectivityManager | null = null;

  constructor(
    private readonly queue: FileEventQueue,
    private readonly client: GatewayClient,
    private readonly logger: EdgeLogger,
  ) {}

  attachConnectivity(manager: ConnectivityManager): void {
    this.connectivity = manager;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.tick();
    }, edgeEnv.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.connectivity?.simulateDisconnect(paused);
  }

  isBackendOnline(): boolean {
    if (this.paused) {
      return false;
    }
    return this.connectivity?.isBackendOnline() ?? true;
  }

  async tick(): Promise<void> {
    if (this.paused || this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      await this.recoverOrphanedSyncing();
      await this.uploadPendingFiles();
      const nowMs = Date.now();
      const pending = (await this.queue.store.listPendingForSync(nowMs)).sort(compareQueuedEvents);
      const batch = pending.slice(0, edgeEnv.syncBatchSize);
      const stats = await this.queue.stats();
      const state = await this.queue.store.getState();
      const config = await this.queue.store.getConfig();
      const hardwareOnline = state.hardwareStatus === "ONLINE";

      if (batch.length === 0) {
        try {
          await this.client.health();
          await this.connectivity?.observe({
            internetOnline: true,
            backendReachable: true,
            hardwareOnline,
            authFailed: false,
            syncing: false,
            pendingCritical: 0,
            openConflicts: (await this.queue.store.listConflicts()).length,
          });
        } catch (error) {
          await this.noteFailure(error, hardwareOnline);
        }
        return;
      }

      await this.connectivity?.observe({
        internetOnline: true,
        backendReachable: true,
        hardwareOnline,
        authFailed: false,
        syncing: true,
        pendingCritical: batch.filter((event) => event.priority === "CRITICAL").length,
        openConflicts: (await this.queue.store.listConflicts()).length,
      });

      for (const event of batch) {
        await this.queue.update(event.eventId, {
          status: "SYNCING",
          lastAttemptAt: new Date().toISOString(),
        });
      }

      try {
        const result = await this.client.syncBatch({
          events: batch.map((event) => ({
            envelope: event.payload,
            priority: event.priority,
            localTransactionId: event.localTransactionId,
            dependsOn: event.dependsOn,
            payloadHash: event.payloadHash,
          })),
          snapshot: {
            ...state,
            queued: stats.pending,
            syncing: stats.syncing,
            synced: stats.synced,
            failed: stats.failed,
            deadLetter: stats.deadLetter,
            configVersion: config?.version ?? null,
            configCachedAt: config?.timestamp ?? null,
            configStale: state.configStale,
          },
        });
        await this.applyAcks(batch, result.results);
        const remainingCritical = (await this.queue.store.listPendingForSync(Date.now())).filter(
          (event) => event.priority === "CRITICAL",
        ).length;
        await this.queue.store.setState({
          lastSuccessfulSyncAt: new Date().toISOString(),
          lastError: null,
        });
        await this.connectivity?.observe({
          internetOnline: true,
          backendReachable: true,
          hardwareOnline,
          authFailed: false,
          syncing: false,
          pendingCritical: remainingCritical,
          openConflicts: (await this.queue.store.listConflicts()).length,
        });
      } catch (error) {
        for (const event of batch) {
          await this.failEvent(event, error);
        }
        await this.noteFailure(error, hardwareOnline);
      }
    } finally {
      this.syncing = false;
    }
  }

  private async applyAcks(batch: QueuedEdgeEvent[], acks: SyncAck[]): Promise<void> {
    const byId = new Map(acks.map((ack) => [ack.eventId, ack]));
    for (const event of batch) {
      const ack = byId.get(event.eventId);
      if (!ack) {
        await this.failEvent(event, new Error("Sync acknowledgement missing"));
        continue;
      }
      switch (ack.status) {
        case "ACCEPTED":
        case "ALREADY_PROCESSED":
          await this.queue.update(event.eventId, {
            status: "SYNCED",
            syncedAt: new Date().toISOString(),
            failureReason: null,
          });
          await this.queue.store.audit("EDGE_EVENT_SYNCED", "EdgeEvent", event.eventId, {
            status: ack.status,
          });
          await this.logger.info("event_synced", { eventId: event.eventId, status: ack.status });
          break;
        case "DEPENDENCY_PENDING":
          await this.queue.update(event.eventId, {
            status: "PENDING",
            nextRetryAt: new Date(Date.now() + 2000).toISOString(),
            failureReason: ack.message,
          });
          break;
        case "CONFLICT":
          await this.queue.update(event.eventId, {
            status: "FAILED",
            failureReason: ack.message,
            recommendedAction: "Authorized resolution required. Local and central states were not overwritten.",
          });
          await this.queue.store.addConflict({
            eventId: event.eventId,
            localTransactionId: event.localTransactionId,
            localState: String(event.payload.payload.localState ?? "LOCAL"),
            centralState: String(ack.transactionId ? "CENTRAL" : "UNKNOWN"),
            reason: ack.message ?? "Sync conflict",
            recommendedAction: "Inspect both records. Do not overwrite automatically.",
            createdAt: new Date().toISOString(),
          });
          await this.queue.store.audit("EDGE_SYNC_CONFLICT_DETECTED", "EdgeEvent", event.eventId, {
            message: ack.message,
          });
          break;
        case "REJECTED":
          await this.failEvent(event, new Error(ack.message ?? "Event rejected"));
          break;
        default: {
          const _exhaustive: never = ack.status;
          return _exhaustive;
        }
      }
    }
  }

  private async failEvent(event: QueuedEdgeEvent, error: unknown): Promise<void> {
    const retryCount = event.retryCount + 1;
    const message = error instanceof Error ? error.message : "Unknown error";
    const dead = !shouldRetry(retryCount, edgeEnv.maxRetries);
    const delay = nextRetryDelayMs(retryCount, edgeEnv.retryBaseMs, edgeEnv.retryMaxMs);
    await this.queue.update(event.eventId, {
      status: dead ? "DEAD_LETTER" : "FAILED",
      retryCount,
      lastAttemptAt: new Date().toISOString(),
      nextRetryAt: dead ? null : new Date(Date.now() + delay).toISOString(),
      failureReason: message,
      firstFailureAt: event.firstFailureAt ?? new Date().toISOString(),
      recommendedAction: dead
        ? "Inspect the dead-letter record. The business event was not deleted."
        : null,
    });
    await this.queue.store.audit(dead ? "EDGE_EVENT_DEAD_LETTER" : "EDGE_EVENT_SYNC_FAILED", "EdgeEvent", event.eventId, {
      message,
      retryCount,
    });
    if (dead) {
      await this.logger.error("event_dead_letter", { eventId: event.eventId, error: message });
    }
  }

  private async noteFailure(error: unknown, hardwareOnline: boolean): Promise<void> {
    const authFailed = error instanceof GatewayAuthError;
    const unavailable = error instanceof BackendUnavailableError || error instanceof GatewayAuthError;
    await this.queue.store.setState({
      lastError: error instanceof Error ? error.message : "Unknown error",
      nextRetryAt: new Date(Date.now() + nextRetryDelayMs(1, edgeEnv.retryBaseMs, edgeEnv.retryMaxMs)).toISOString(),
    });
    await this.connectivity?.observe({
      internetOnline: !unavailable,
      backendReachable: false,
      hardwareOnline,
      authFailed,
      syncing: false,
      pendingCritical: 1,
      openConflicts: (await this.queue.store.listConflicts()).length,
    });
    if (unavailable) {
      await this.logger.warn("backend_unavailable", { error: error instanceof Error ? error.message : "unknown" });
    }
  }

  private async recoverOrphanedSyncing(): Promise<void> {
    const orphaned = await this.queue.listByStatus("SYNCING");
    for (const event of orphaned) {
      await this.queue.update(event.eventId, { status: "PENDING" });
    }
  }

  private async uploadPendingFiles(): Promise<void> {
    if (this.paused) {
      return;
    }
    const pending = await this.queue.store.listPendingFiles();
    for (const file of pending.slice(0, 5)) {
      try {
        const bytes = await readFile(file.localPath);
        await this.client.uploadFile({
          fileId: file.fileId,
          contentHash: file.contentHash,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          eventId: file.eventId,
          contentBase64: bytes.toString("base64"),
        });
        await this.queue.store.markFileSynced(file.fileId);
      } catch (error) {
        if (error instanceof BackendUnavailableError || error instanceof GatewayAuthError) {
          throw error;
        }
        await this.logger.warn("file_upload_failed", {
          fileId: file.fileId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }
  }
}
