import { apiRequest } from "../../shared/api/client.ts";

export type PublicSyncSnapshot = {
  gatewayId: string;
  gatewayCode: string;
  gatewayName: string;
  site: { id: string; code: string; name: string };
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
  lastHeartbeatAt: string | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  configVersion: string | null;
  configCachedAt: string | null;
  configStale: boolean;
  openConflicts: number;
};

export type PublicSyncConflict = {
  id: string;
  eventId: string;
  gatewayId: string;
  localTransactionId: string | null;
  transactionId: string | null;
  localState: string;
  centralState: string;
  reason: string;
  recommendedAction: string;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type PublicDeadLetter = {
  eventId: string;
  gatewayId: string;
  eventType: string;
  error: string;
  retryCount: number;
  firstFailureAt: string;
  lastFailureAt: string;
  recommendedAction: string;
};

export async function listSyncStatus(): Promise<{ items: PublicSyncSnapshot[] }> {
  return apiRequest("/api/v1/sync");
}

export async function listSyncConflicts(): Promise<{ items: PublicSyncConflict[] }> {
  return apiRequest("/api/v1/sync/conflicts");
}

export async function listDeadLetters(): Promise<{ items: PublicDeadLetter[] }> {
  return apiRequest("/api/v1/sync/dead-letters");
}

export async function acknowledgeConflict(id: string): Promise<{ conflict: PublicSyncConflict }> {
  return apiRequest(`/api/v1/sync/conflicts/${id}/acknowledge`, { method: "POST" });
}

export async function resolveConflict(id: string, note: string): Promise<{ conflict: PublicSyncConflict }> {
  return apiRequest(`/api/v1/sync/conflicts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function formatSyncTime(iso: string | null, nowMs = Date.now()): string {
  if (!iso) {
    return "Never";
  }
  const age = Math.max(0, nowMs - Date.parse(iso));
  if (age < 60_000) {
    return `${Math.round(age / 1000)} seconds ago`;
  }
  return new Date(iso).toLocaleTimeString();
}

export function offlineBannerText(snapshot: Pick<PublicSyncSnapshot, "internetStatus" | "backendStatus" | "configStale">): string | null {
  if (snapshot.configStale) {
    return "Configuration refresh required.";
  }
  if (snapshot.internetStatus === "OFFLINE" || snapshot.backendStatus === "UNREACHABLE") {
    return "Internet connection unavailable. Weighbridge operations are being stored locally.";
  }
  return null;
}
