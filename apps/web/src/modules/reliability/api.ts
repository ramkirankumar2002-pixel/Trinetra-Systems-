import { apiRequest } from "../../shared/api/client.ts";

export type DependencyHealthStatus = "AVAILABLE" | "DEGRADED" | "UNAVAILABLE" | "DISABLED" | "SIMULATION";
export type BackupPublicStatus =
  | "DISABLED"
  | "NEVER"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "UNVERIFIED"
  | "REQUIRES_INFRASTRUCTURE";

export type PublicDependencyHealth = {
  name: string;
  status: DependencyHealthStatus;
  detail: string;
};

export type PublicBackupOverview = {
  enabled: boolean;
  status: BackupPublicStatus;
  lastSuccessfulAt: string | null;
  lastFailedAt: string | null;
  lastSizeBytes: number | null;
  retentionDays: number;
  infrastructureNote: string;
};

export type PublicStaleTransaction = {
  id: string;
  referenceNumber: string;
  status: string;
  siteId: string;
  updatedAt: string;
  warning: string;
};

export type PublicStaleGateway = {
  id: string;
  code: string;
  siteId: string;
  liveness: "ONLINE" | "STALE" | "OFFLINE" | "DISABLED";
  lastHeartbeatAt: string | null;
};

export type ReliabilityStatus = {
  systemStatus: "AVAILABLE" | "DEGRADED" | "UNAVAILABLE";
  databaseName: string | null;
  dependencies: PublicDependencyHealth[];
  backup: PublicBackupOverview;
  staleTransactions: PublicStaleTransaction[];
  staleTransactionCount: number;
  offlineGateways: PublicStaleGateway[];
  openRecoveryWarnings: number;
};

export type ConsistencyFinding = {
  entityType: string;
  entityId: string;
  code: string;
  message: string;
  severity: "WARNING" | "ERROR";
};

export function getReliabilityStatus(): Promise<{ status: ReliabilityStatus }> {
  return apiRequest("/api/v1/reliability/status");
}

export function runReliabilityScan(): Promise<{ result: { staleTransactions: number; notificationsAttempted: number } }> {
  return apiRequest("/api/v1/reliability/scan", { method: "POST" });
}

export function triggerReliabilityBackup(): Promise<{ backup: { id: string; status: string } }> {
  return apiRequest("/api/v1/reliability/backups", { method: "POST" });
}

export function getConsistencyReport(): Promise<{ findings: ConsistencyFinding[]; scanned: number }> {
  return apiRequest("/api/v1/reliability/consistency");
}

export async function downloadReliabilityExport(category: "transactions" | "weighments" | "audit" | "security", search = ""): Promise<void> {
  const result = await apiRequest<{ filename: string; csv: string }>(
    `/api/v1/reliability/export/${category}${search === "" ? "" : `?${search}`}`,
  );
  const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function dependencyLabel(name: string): string {
  switch (name) {
    case "postgresql":
      return "Database";
    case "backend":
      return "Backend";
    case "edgeGateway":
      return "Gateway";
    case "offlineSync":
      return "Synchronization";
    case "weighbridge":
      return "Weighbridge";
    case "anpr":
      return "ANPR";
    case "ocr":
      return "Documents / OCR";
    case "notifications":
      return "Notifications";
    case "api":
      return "API";
    case "voice":
      return "Voice";
    default:
      return name;
  }
}
