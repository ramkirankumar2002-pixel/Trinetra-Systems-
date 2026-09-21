import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { EdgeEventEnvelope } from "../events/envelope.js";
import { priorityForEventType } from "../offline/priority.js";
import type { EventPriority, QueuedEdgeEvent, QueueStatus } from "../queue/types.js";
import { atomicWriteJson, recoverTempFile } from "./atomicWrite.js";
import type {
  ConfigCache,
  EnqueueOptions,
  GatewayRuntimeState,
  LocalAuditRecord,
  LocalConflict,
  LocalFileRecord,
  LocalStoreFile,
  LocalTransaction,
  StoreStats,
} from "./types.js";

const STORE_VERSION = 17;
const MAX_AUDIT = 400;
const MAX_LOW_PRIORITY = 2000;

export const DEFAULT_STORAGE_LIMIT_BYTES = 524_288_000;
export const DEFAULT_QUEUE_LIMIT = 8000;

const EMPTY_STATE: GatewayRuntimeState = {
  connectivityState: "ONLINE",
  internetStatus: "ONLINE",
  backendStatus: "UNREACHABLE",
  hardwareStatus: "OFFLINE",
  syncStatus: "IDLE",
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastSuccessfulSyncAt: null,
  nextRetryAt: null,
  lastError: null,
  storageUsedBytes: 0,
  storageLimitBytes: DEFAULT_STORAGE_LIMIT_BYTES,
  configStale: false,
};

export class LocalStore {
  private writeQueue: Promise<unknown> = Promise.resolve();
  private recovered = false;

  constructor(private readonly filePath: string) {}

  async enqueue(envelope: EdgeEventEnvelope, options: EnqueueOptions = {}): Promise<QueuedEdgeEvent> {
    return this.mutate((store) => {
      const existing = store.events.find((event) => event.eventId === envelope.eventId);
      if (existing) {
        return existing;
      }
      const priority = options.priority ?? priorityForEventType(envelope.eventType);
      if (store.events.length >= DEFAULT_QUEUE_LIMIT && priority === "LOW") {
        throw new Error("Local queue is at capacity. Low-priority telemetry was not stored.");
      }
      const created: QueuedEdgeEvent = {
        eventId: envelope.eventId,
        gatewayId: envelope.gatewayId,
        deviceId: envelope.deviceId,
        eventType: envelope.eventType,
        payload: envelope,
        eventTimestamp: envelope.timestamp,
        receivedAt: new Date().toISOString(),
        status: "PENDING",
        retryCount: 0,
        lastAttemptAt: null,
        nextRetryAt: null,
        syncedAt: null,
        failureReason: null,
        firstFailureAt: null,
        priority,
        sequence: envelope.sequence,
        localTransactionId: options.localTransactionId ?? readLocalTransactionId(envelope.payload),
        dependsOn: options.dependsOn ?? [],
        payloadHash: options.payloadHash ?? hashPayload(envelope.payload),
        recommendedAction: null,
      };
      store.events.push(created);
      return created;
    });
  }

  async listByStatus(...statuses: QueueStatus[]): Promise<QueuedEdgeEvent[]> {
    const store = await this.read();
    return store.events.filter((event) => statuses.includes(event.status));
  }

  async listPendingForSync(nowMs: number): Promise<QueuedEdgeEvent[]> {
    const store = await this.read();
    return store.events.filter((event) => {
      if (event.status !== "PENDING" && event.status !== "FAILED") {
        return false;
      }
      if (event.nextRetryAt && Date.parse(event.nextRetryAt) > nowMs) {
        return false;
      }
      return true;
    });
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
    >,
  ): Promise<QueuedEdgeEvent | null> {
    return this.mutate((store) => {
      const event = store.events.find((item) => item.eventId === eventId);
      if (!event) {
        return null;
      }
      Object.assign(event, patch);
      return event;
    });
  }

  async get(eventId: string): Promise<QueuedEdgeEvent | null> {
    const store = await this.read();
    return store.events.find((event) => event.eventId === eventId) ?? null;
  }

  async stats(): Promise<StoreStats> {
    const store = await this.read();
    return {
      pending: store.events.filter((event) => event.status === "PENDING").length,
      syncing: store.events.filter((event) => event.status === "SYNCING").length,
      synced: store.events.filter((event) => event.status === "SYNCED").length,
      failed: store.events.filter((event) => event.status === "FAILED").length,
      deadLetter: store.events.filter((event) => event.status === "DEAD_LETTER").length,
      transactions: store.transactions.length,
      files: store.files.length,
      conflicts: store.conflicts.length,
    };
  }

  async getState(): Promise<GatewayRuntimeState> {
    const store = await this.read();
    return store.gatewayState;
  }

  async setState(patch: Partial<GatewayRuntimeState>): Promise<GatewayRuntimeState> {
    return this.mutate((store) => {
      store.gatewayState = { ...store.gatewayState, ...patch };
      return store.gatewayState;
    });
  }

  async getConfig(): Promise<ConfigCache | null> {
    const store = await this.read();
    return store.configCache;
  }

  async setConfig(cache: ConfigCache): Promise<void> {
    await this.mutate((store) => {
      store.configCache = cache;
    });
  }

  async nextLocalTransactionId(gatewayCode: string, nowMs: number): Promise<string> {
    return this.mutate((store) => {
      const day = new Date(nowMs).toISOString().slice(0, 10).replaceAll("-", "");
      const current = store.counters.byDate[day] ?? 0;
      const sequence = current + 1;
      store.counters.byDate[day] = sequence;
      const compact = gatewayCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "EDGE01";
      return `${compact}-${day}-${String(sequence).padStart(6, "0")}`;
    });
  }

  async upsertTransaction(row: LocalTransaction): Promise<LocalTransaction> {
    return this.mutate((store) => {
      const index = store.transactions.findIndex((item) => item.localTransactionId === row.localTransactionId);
      if (index === -1) {
        store.transactions.push(row);
        return row;
      }
      store.transactions[index] = row;
      return row;
    });
  }

  async getTransaction(localTransactionId: string): Promise<LocalTransaction | null> {
    const store = await this.read();
    return store.transactions.find((item) => item.localTransactionId === localTransactionId) ?? null;
  }

  async listTransactions(): Promise<LocalTransaction[]> {
    const store = await this.read();
    return store.transactions;
  }

  async addFile(record: LocalFileRecord): Promise<LocalFileRecord> {
    return this.mutate((store) => {
      const existing = store.files.find((item) => item.fileId === record.fileId || item.contentHash === record.contentHash);
      if (existing) {
        return existing;
      }
      store.files.push(record);
      return record;
    });
  }

  async listPendingFiles(): Promise<LocalFileRecord[]> {
    const store = await this.read();
    return store.files.filter((file) => file.syncStatus !== "SYNCED");
  }

  async markFileSynced(fileId: string): Promise<void> {
    await this.mutate((store) => {
      const file = store.files.find((item) => item.fileId === fileId);
      if (file) {
        file.syncStatus = "SYNCED";
      }
    });
  }

  async addConflict(conflict: LocalConflict): Promise<void> {
    await this.mutate((store) => {
      if (!store.conflicts.some((item) => item.eventId === conflict.eventId)) {
        store.conflicts.push(conflict);
      }
    });
  }

  async listConflicts(): Promise<LocalConflict[]> {
    const store = await this.read();
    return store.conflicts;
  }

  async audit(action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}): Promise<void> {
    await this.mutate((store) => {
      const record: LocalAuditRecord = {
        id: randomUUID(),
        action,
        entityType,
        entityId,
        at: new Date().toISOString(),
        details,
      };
      store.audit.push(record);
      if (store.audit.length > MAX_AUDIT) {
        store.audit.splice(0, store.audit.length - MAX_AUDIT);
      }
    });
  }

  async listAudit(): Promise<LocalAuditRecord[]> {
    const store = await this.read();
    return store.audit;
  }

  async measureStorage(): Promise<{ usedBytes: number; approachingLimit: boolean }> {
    const store = await this.read();
    let used = Buffer.byteLength(JSON.stringify(store));
    for (const file of store.files) {
      try {
        used += (await stat(file.localPath)).size;
      } catch {
        // missing file
      }
    }
    await this.setState({ storageUsedBytes: used });
    return { usedBytes: used, approachingLimit: used > store.gatewayState.storageLimitBytes * 0.85 };
  }

  filesDirectory(): string {
    return path.join(path.dirname(this.filePath), "files");
  }

  private async mutate<T>(fn: (store: LocalStoreFile) => T | Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const store = await this.read();
      const result = await fn(store);
      pruneLowPriorityIfNeeded(store);
      await atomicWriteJson(this.filePath, store);
      return result;
    };
    const next = this.writeQueue.then(run, run);
    this.writeQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async read(): Promise<LocalStoreFile> {
    if (!this.recovered) {
      await recoverTempFile(this.filePath);
      this.recovered = true;
    }
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeStore(JSON.parse(raw) as Partial<LocalStoreFile> & { events?: unknown });
    } catch {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      return emptyStore();
    }
  }
}

function emptyStore(): LocalStoreFile {
  return {
    version: STORE_VERSION,
    events: [],
    transactions: [],
    files: [],
    configCache: null,
    gatewayState: { ...EMPTY_STATE },
    audit: [],
    conflicts: [],
    counters: { byDate: {} },
  };
}

function normalizeStore(raw: Partial<LocalStoreFile> & { events?: unknown }): LocalStoreFile {
  const events = Array.isArray(raw.events) ? raw.events.map(normalizeEvent) : [];
  return {
    version: STORE_VERSION,
    events,
    transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
    files: Array.isArray(raw.files) ? raw.files : [],
    configCache: raw.configCache ?? null,
    gatewayState: { ...EMPTY_STATE, ...(raw.gatewayState ?? {}) },
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts : [],
    counters: raw.counters ?? { byDate: {} },
  };
}

function normalizeEvent(value: unknown): QueuedEdgeEvent {
  const record = value as Record<string, unknown>;
  const payload = (record.payload ?? {}) as EdgeEventEnvelope;
  return {
    eventId: String(record.eventId ?? ""),
    gatewayId: String(record.gatewayId ?? payload.gatewayId ?? ""),
    deviceId: String(record.deviceId ?? payload.deviceId ?? ""),
    eventType: String(record.eventType ?? payload.eventType ?? ""),
    payload,
    eventTimestamp: String(record.eventTimestamp ?? record.timestamp ?? payload.timestamp ?? new Date().toISOString()),
    receivedAt: String(record.receivedAt ?? record.createdAt ?? new Date().toISOString()),
    status: isStatus(record.status) ? record.status : "PENDING",
    retryCount: typeof record.retryCount === "number" ? record.retryCount : 0,
    lastAttemptAt: typeof record.lastAttemptAt === "string" ? record.lastAttemptAt : typeof record.lastAttempt === "string" ? record.lastAttempt : null,
    nextRetryAt: typeof record.nextRetryAt === "string" ? record.nextRetryAt : null,
    syncedAt: typeof record.syncedAt === "string" ? record.syncedAt : null,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : typeof record.lastError === "string" ? record.lastError : null,
    firstFailureAt: typeof record.firstFailureAt === "string" ? record.firstFailureAt : null,
    priority: isPriority(record.priority) ? record.priority : priorityForEventType(String(record.eventType ?? "")),
    sequence: typeof record.sequence === "string" ? record.sequence : payload.sequence ?? null,
    localTransactionId: typeof record.localTransactionId === "string" ? record.localTransactionId : readLocalTransactionId(payload.payload ?? {}),
    dependsOn: Array.isArray(record.dependsOn) ? record.dependsOn.filter((item): item is string => typeof item === "string") : [],
    payloadHash: typeof record.payloadHash === "string" ? record.payloadHash : null,
    recommendedAction: typeof record.recommendedAction === "string" ? record.recommendedAction : null,
  };
}

function isStatus(value: unknown): value is QueueStatus {
  return value === "PENDING" || value === "SYNCING" || value === "SYNCED" || value === "FAILED" || value === "DEAD_LETTER";
}

function isPriority(value: unknown): value is EventPriority {
  return value === "CRITICAL" || value === "HIGH" || value === "NORMAL" || value === "LOW";
}

function readLocalTransactionId(payload: Record<string, unknown>): string | null {
  return typeof payload.localTransactionId === "string" ? payload.localTransactionId : null;
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function pruneLowPriorityIfNeeded(store: LocalStoreFile): void {
  const low = store.events.filter((event) => event.priority === "LOW" && event.status === "SYNCED");
  if (low.length <= MAX_LOW_PRIORITY) {
    return;
  }
  const remove = new Set(low.slice(0, low.length - MAX_LOW_PRIORITY).map((event) => event.eventId));
  store.events = store.events.filter((event) => !remove.has(event.eventId));
}
