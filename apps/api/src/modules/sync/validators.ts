import { isConnectivityState } from "../../domain/connectivityState.js";
import { isEventPriority, type EventPriority } from "../../domain/eventPriority.js";
import { HttpError } from "../../lib/httpError.js";

export type SyncBatchEventInput = {
  envelope: unknown;
  priority: EventPriority;
  localTransactionId: string | null;
  dependsOn: string[];
  payloadHash: string | null;
};

export type SyncSnapshotInput = {
  connectivityState: string;
  internetStatus: string;
  backendStatus: string;
  hardwareStatus: string;
  syncStatus: string;
  queued: number;
  syncing: number;
  synced: number;
  failed: number;
  deadLetter: number;
  lastSuccessfulSyncAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  configVersion: string | null;
  configCachedAt: string | null;
  configStale: boolean;
};

export function parseSyncBatchInput(body: unknown): {
  events: SyncBatchEventInput[];
  snapshot: SyncSnapshotInput | null;
} {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A synchronization batch is required");
  }
  const record = body as Record<string, unknown>;
  const events = Array.isArray(record.events) ? record.events : [];
  if (events.length === 0) {
    throw new HttpError(400, "At least one event is required");
  }
  if (events.length > 50) {
    throw new HttpError(400, "A batch cannot contain more than 50 events");
  }
  return {
    events: events.map(parseBatchEvent),
    snapshot: isRecord(record.snapshot) ? parseSnapshot(record.snapshot) : null,
  };
}

export function parseFileUploadInput(body: unknown): {
  fileId: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  eventId: string | null;
  contentBase64: string;
} {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "File details are required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.fileId !== "string" || record.fileId.trim() === "") {
    throw new HttpError(400, "A fileId is required");
  }
  if (typeof record.contentHash !== "string" || record.contentHash.length < 16) {
    throw new HttpError(400, "A content hash is required");
  }
  if (typeof record.mimeType !== "string" || record.mimeType.trim() === "") {
    throw new HttpError(400, "A MIME type is required");
  }
  if (typeof record.contentBase64 !== "string" || record.contentBase64.trim() === "") {
    throw new HttpError(400, "File content is required");
  }
  return {
    fileId: record.fileId.trim(),
    contentHash: record.contentHash.trim(),
    mimeType: record.mimeType.trim(),
    sizeBytes: typeof record.sizeBytes === "number" ? record.sizeBytes : 0,
    eventId: typeof record.eventId === "string" ? record.eventId : null,
    contentBase64: record.contentBase64,
  };
}

export function parseResolutionNote(body: unknown): string {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A resolution note is required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.note !== "string" || record.note.trim().length < 4) {
    throw new HttpError(400, "A resolution note is required");
  }
  return record.note.trim();
}

function parseBatchEvent(value: unknown): SyncBatchEventInput {
  if (typeof value !== "object" || value === null) {
    throw new HttpError(400, "Each batch item must be an event");
  }
  const record = value as Record<string, unknown>;
  const envelope = record.envelope ?? record;
  const priority = typeof record.priority === "string" && isEventPriority(record.priority) ? record.priority : "NORMAL";
  return {
    envelope,
    priority,
    localTransactionId: typeof record.localTransactionId === "string" ? record.localTransactionId : null,
    dependsOn: Array.isArray(record.dependsOn)
      ? record.dependsOn.filter((item): item is string => typeof item === "string")
      : [],
    payloadHash: typeof record.payloadHash === "string" ? record.payloadHash : null,
  };
}

export function parseSnapshot(record: Record<string, unknown>): SyncSnapshotInput {
  return {
    connectivityState: isConnectivityState(String(record.connectivityState ?? ""))
      ? String(record.connectivityState)
      : "DEGRADED",
    internetStatus: record.internetStatus === "OFFLINE" ? "OFFLINE" : "ONLINE",
    backendStatus: record.backendStatus === "UNREACHABLE" ? "UNREACHABLE" : "REACHABLE",
    hardwareStatus: record.hardwareStatus === "OFFLINE" ? "OFFLINE" : "ONLINE",
    syncStatus: record.syncStatus === "SYNCING" || record.syncStatus === "ERROR" ? String(record.syncStatus) : "IDLE",
    queued: numberOr(record.queued, 0),
    syncing: numberOr(record.syncing, 0),
    synced: numberOr(record.synced, 0),
    failed: numberOr(record.failed, 0),
    deadLetter: numberOr(record.deadLetter, 0),
    lastSuccessfulSyncAt: typeof record.lastSuccessfulSyncAt === "string" ? record.lastSuccessfulSyncAt : null,
    nextRetryAt: typeof record.nextRetryAt === "string" ? record.nextRetryAt : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
    storageUsedBytes: numberOr(record.storageUsedBytes, 0),
    storageLimitBytes: numberOr(record.storageLimitBytes, 524288000),
    configVersion: typeof record.configVersion === "string" ? record.configVersion : null,
    configCachedAt: typeof record.configCachedAt === "string" ? record.configCachedAt : null,
    configStale: record.configStale === true,
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
