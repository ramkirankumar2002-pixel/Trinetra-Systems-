import { MIN_BACKUP_BYTES } from "./types.js";

export type RetentionCandidate = {
  id: string;
  status: "SUCCESS" | "FAILED" | "UNVERIFIED" | "RUNNING";
  startedAt: Date;
  keep: boolean;
};

export function verifyBackupArtifact(input: {
  exists: boolean;
  sizeBytes: number;
  processSucceeded: boolean;
  minBytes?: number;
}): { ok: true; sizeBytes: number } | { ok: false; errorCode: string } {
  if (!input.processSucceeded) {
    return { ok: false, errorCode: "BACKUP_PROCESS_FAILED" };
  }
  if (!input.exists) {
    return { ok: false, errorCode: "BACKUP_FILE_MISSING" };
  }
  if (input.sizeBytes < (input.minBytes ?? MIN_BACKUP_BYTES)) {
    return { ok: false, errorCode: "BACKUP_FILE_TOO_SMALL" };
  }
  return { ok: true, sizeBytes: input.sizeBytes };
}

export function backupsEligibleForDeletion(
  rows: RetentionCandidate[],
  retentionDays: number,
  now: Date = new Date(),
): string[] {
  const successful = rows
    .filter((row) => row.status === "SUCCESS")
    .sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime());
  if (successful.length <= 1) {
    return [];
  }

  const latestId = successful[0]?.id;
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return successful
    .filter((row) => row.id !== latestId && !row.keep && row.startedAt.getTime() < cutoff)
    .map((row) => row.id);
}

export function publicBackupStatus(input: {
  enabled: boolean;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastStatus: string | null;
  infrastructureAvailable: boolean;
}): "DISABLED" | "NEVER" | "SUCCESS" | "FAILED" | "RUNNING" | "UNVERIFIED" | "REQUIRES_INFRASTRUCTURE" {
  if (!input.enabled) {
    return "DISABLED";
  }
  if (!input.infrastructureAvailable && !input.lastSuccessAt) {
    return "REQUIRES_INFRASTRUCTURE";
  }
  if (input.lastStatus === "RUNNING") {
    return "RUNNING";
  }
  if (input.lastStatus === "UNVERIFIED") {
    return "UNVERIFIED";
  }
  if (input.lastSuccessAt && (!input.lastFailureAt || input.lastSuccessAt >= input.lastFailureAt)) {
    return "SUCCESS";
  }
  if (input.lastFailureAt) {
    return "FAILED";
  }
  return "NEVER";
}
