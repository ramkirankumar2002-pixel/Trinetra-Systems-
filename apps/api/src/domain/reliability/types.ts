export const DEPENDENCY_HEALTH_STATUSES = [
  "AVAILABLE",
  "DEGRADED",
  "UNAVAILABLE",
  "DISABLED",
  "SIMULATION",
] as const;

export type DependencyHealthStatus = (typeof DEPENDENCY_HEALTH_STATUSES)[number];

export const GATEWAY_LIVENESS_STATUSES = ["ONLINE", "STALE", "OFFLINE"] as const;
export type GatewayLivenessStatus = (typeof GATEWAY_LIVENESS_STATUSES)[number];

export const BACKUP_PUBLIC_STATUSES = [
  "DISABLED",
  "NEVER",
  "RUNNING",
  "SUCCESS",
  "FAILED",
  "UNVERIFIED",
  "REQUIRES_INFRASTRUCTURE",
] as const;

export type BackupPublicStatus = (typeof BACKUP_PUBLIC_STATUSES)[number];

export type ConsistencySeverity = "WARNING" | "ERROR";

export type ConsistencyFinding = {
  entityType: string;
  entityId: string;
  code: string;
  message: string;
  severity: ConsistencySeverity;
};

export type StaleTransactionThresholds = {
  documentPendingHours: number;
  pendingApprovalHours: number;
  unloadingHours: number;
  secondWeighmentHours: number;
  intermediateHours: number;
};

export const DEFAULT_STALE_THRESHOLDS: StaleTransactionThresholds = {
  documentPendingHours: 4,
  pendingApprovalHours: 8,
  unloadingHours: 6,
  secondWeighmentHours: 4,
  intermediateHours: 12,
};

export const MIN_BACKUP_BYTES = 64;
