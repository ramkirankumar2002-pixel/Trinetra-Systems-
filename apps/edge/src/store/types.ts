import type { EventPriority, QueuedEdgeEvent, QueueStats } from "../queue/types.js";

export type ConnectivityState = "ONLINE" | "DEGRADED" | "OFFLINE" | "SYNCING" | "RECOVERING" | "ERROR";
export type LocalTransactionState =
  | "IDENTIFIED"
  | "GROSS_CAPTURED"
  | "TARE_CAPTURED"
  | "PAUSED_APPROVAL"
  | "LOCAL_COMPLETED";

export type LocalTransaction = {
  localTransactionId: string;
  vehicleNumber: string | null;
  vehicleId: string | null;
  weighbridgeId: string | null;
  siteId: string | null;
  materialId: string | null;
  workflowRef: string | null;
  localState: LocalTransactionState;
  completionState: "NONE" | "LOCAL_COMPLETED" | "CENTRAL_COMPLETED";
  grossWeightKg: string | null;
  tareWeightKg: string | null;
  netWeightKg: string | null;
  tareExceedsGross: boolean;
  approvalRequired: boolean;
  eventIds: string[];
  operatorMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalFileRecord = {
  fileId: string;
  eventId: string | null;
  localPath: string;
  contentHash: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
};

export type CachedVehicle = {
  id: string;
  registrationNumber: string;
  normalizedPlateNumber: string;
  displayRegistrationNumber: string;
};

export type CachedDevice = {
  id: string;
  code: string;
  name: string;
  deviceType: string;
  enabled: boolean;
  status: string;
  provider?: string;
  protocolReadiness?: string;
  adapterKey?: string | null;
  serialPort?: string | null;
  host?: string | null;
  port?: number | null;
};

export type ConfigCache = {
  version: string;
  timestamp: string;
  source: "CENTRAL";
  validUntil: string;
  gateway: {
    id: string;
    code: string;
    name: string;
    site: { id: string; code: string; name: string };
  };
  devices: CachedDevice[];
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string }>;
  anomalyConfigs: Array<{
    weighbridgeId: string;
    emptyPlatformThresholdKg: number;
    maxChangePerSecondKg: number;
    weightJumpThresholdKg: number;
    maxInstabilityDurationMs: number;
    minAnomalyDurationMs: number;
    consecutiveAnomalyCount: number;
    cooldownMs: number;
    suddenChangeWindowMs: number;
    suppressAlertsInMaintenance: boolean;
  }>;
  policy: {
    version: number;
    source: string;
    timestamp: string;
    validUntil: string;
    allowWeightRead: boolean;
    allowAnpr: boolean;
    allowDocumentCapture: boolean;
    allowBasicTransactionRecording: boolean;
    allowWeightAnomalyDetection: boolean;
    transactionCompletion: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    materialVerification: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    approvals: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    configChanges: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    userManagement: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    hardwareConfigChanges: "ALLOWED" | "CONDITIONAL" | "BLOCKED";
    maxConfigAgeHours: number;
  };
  vehicles: CachedVehicle[];
};

export type GatewayRuntimeState = {
  connectivityState: ConnectivityState;
  internetStatus: "ONLINE" | "OFFLINE";
  backendStatus: "REACHABLE" | "UNREACHABLE";
  hardwareStatus: "ONLINE" | "OFFLINE";
  syncStatus: "IDLE" | "SYNCING" | "ERROR";
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastSuccessfulSyncAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
  storageUsedBytes: number;
  storageLimitBytes: number;
  configStale: boolean;
};

export type LocalAuditRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  at: string;
  details: Record<string, unknown>;
};

export type LocalConflict = {
  eventId: string;
  localTransactionId: string | null;
  localState: string;
  centralState: string;
  reason: string;
  recommendedAction: string;
  createdAt: string;
};

export type LocalStoreFile = {
  version: number;
  events: QueuedEdgeEvent[];
  transactions: LocalTransaction[];
  files: LocalFileRecord[];
  configCache: ConfigCache | null;
  gatewayState: GatewayRuntimeState;
  audit: LocalAuditRecord[];
  conflicts: LocalConflict[];
  counters: { byDate: Record<string, number> };
};

export type EnqueueOptions = {
  priority?: EventPriority;
  localTransactionId?: string | null;
  dependsOn?: string[];
  payloadHash?: string | null;
};

export type StoreStats = QueueStats & {
  transactions: number;
  files: number;
  conflicts: number;
};
