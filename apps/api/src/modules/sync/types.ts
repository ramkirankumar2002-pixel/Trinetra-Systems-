import type { EdgeConnectivityState, EdgeSyncAckStatus, EdgeSyncConflictStatus } from "@prisma/client";

export type PublicSyncSnapshot = {
  gatewayId: string;
  gatewayCode: string;
  gatewayName: string;
  site: { id: string; code: string; name: string };
  connectivityState: EdgeConnectivityState;
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

export type PublicSyncAck = {
  eventId: string;
  status: EdgeSyncAckStatus;
  message: string | null;
  conflictId: string | null;
  weighmentId: string | null;
  transactionId: string | null;
  alreadyProcessed: boolean;
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
  status: EdgeSyncConflictStatus;
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
