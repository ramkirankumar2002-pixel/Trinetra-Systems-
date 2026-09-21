import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { BackupRunStatus, BackupTrigger } from "@prisma/client";
import { env } from "../../config/env.js";
import { backupsEligibleForDeletion, verifyBackupArtifact } from "../../domain/reliability/backupPolicy.js";
import { publicBackupStatus } from "../../domain/reliability/backupPolicy.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { writeLog } from "../../lib/logger.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { runPgDump, type PgDumpResult } from "./pgDump.js";
import type { ActorContext } from "../shared/actor.js";

export type BackupExecutor = (destinationFile: string) => Promise<PgDumpResult>;

export type PublicBackupRun = {
  id: string;
  status: BackupRunStatus;
  trigger: BackupTrigger;
  startedAt: string;
  finishedAt: string | null;
  verifiedAt: string | null;
  sizeBytes: number | null;
  relativeName: string | null;
  errorCode: string | null;
};

export async function runConfiguredBackup(input: {
  trigger: BackupTrigger;
  actor?: ActorContext;
  executor?: BackupExecutor;
}): Promise<PublicBackupRun> {
  if (!env.backupEnabled) {
    throw new HttpError(409, "Automated backup is disabled");
  }

  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const relativeName = `trinetra-${stamp}.dump`;
  const directory = env.backupDirectory;
  await mkdir(directory, { recursive: true });
  const partialName = `${relativeName}.partial`;
  const destination = path.join(directory, partialName);

  const running = await prisma.backupRun.create({
    data: {
      organizationId: input.actor?.user.organizationId ?? null,
      status: BackupRunStatus.RUNNING,
      trigger: input.trigger,
      startedAt,
      relativeName: partialName,
    },
  });

  if (input.actor) {
    await writeAudit({
      organizationId: input.actor.user.organizationId,
      actorUserId: input.actor.user.id,
      action: AUDIT_ACTIONS.BACKUP_STARTED,
      entityType: "BackupRun",
      entityId: running.id,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      metadata: { trigger: input.trigger },
    });
  }

  const executor = input.executor ?? runPgDump;
  let dump: PgDumpResult;
  try {
    dump = await executor(destination);
  } catch {
    dump = { ok: false, errorCode: "BACKUP_PROCESS_FAILED" };
  }

  let exists = false;
  let sizeBytes = 0;
  try {
    const info = await stat(destination);
    exists = info.isFile();
    sizeBytes = info.size;
  } catch {
    exists = false;
  }

  const verified = verifyBackupArtifact({
    exists,
    sizeBytes,
    processSucceeded: dump.ok,
  });

  if (!verified.ok) {
    await prisma.backupRun.update({
      where: { id: running.id },
      data: {
        status: BackupRunStatus.FAILED,
        finishedAt: new Date(),
        sizeBytes: exists ? sizeBytes : null,
        errorCode: dump.ok ? verified.errorCode : dump.errorCode,
      },
    });
    writeLog("warn", "backup_failed", { runId: running.id, errorCode: dump.ok ? verified.errorCode : dump.errorCode });
    await unlink(destination).catch(() => undefined);
    if (input.actor) {
      await writeAudit({
        organizationId: input.actor.user.organizationId,
        actorUserId: input.actor.user.id,
        action: AUDIT_ACTIONS.BACKUP_FAILED,
        entityType: "BackupRun",
        entityId: running.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
        metadata: { errorCode: dump.ok ? verified.errorCode : dump.errorCode },
      });
    }
    const failed = await prisma.backupRun.findUniqueOrThrow({ where: { id: running.id } });
    return toPublicBackupRun(failed);
  }

  const finalPath = path.join(directory, relativeName);
  const { rename } = await import("node:fs/promises");
  await rename(destination, finalPath);
  const checksum = await sha256File(finalPath);

  const succeeded = await prisma.backupRun.update({
    where: { id: running.id },
    data: {
      status: BackupRunStatus.SUCCESS,
      finishedAt: new Date(),
      verifiedAt: new Date(),
      sizeBytes: verified.sizeBytes,
      relativeName,
      checksumSha256: checksum,
      errorCode: null,
    },
  });

  writeLog("info", "backup_succeeded", { runId: succeeded.id, sizeBytes: verified.sizeBytes });
  if (input.actor) {
    await writeAudit({
      organizationId: input.actor.user.organizationId,
      actorUserId: input.actor.user.id,
      action: AUDIT_ACTIONS.BACKUP_SUCCEEDED,
      entityType: "BackupRun",
      entityId: succeeded.id,
      ipAddress: input.actor.ipAddress,
      userAgent: input.actor.userAgent,
      metadata: { sizeBytes: verified.sizeBytes },
    });
  }

  await applyRetention(input.actor);
  return toPublicBackupRun(succeeded);
}

export async function listBackupRuns(): Promise<PublicBackupRun[]> {
  const rows = await prisma.backupRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  return rows.map(toPublicBackupRun);
}

export async function backupOverview(): Promise<{
  enabled: boolean;
  status: ReturnType<typeof publicBackupStatus>;
  lastSuccessfulAt: string | null;
  lastFailedAt: string | null;
  lastSizeBytes: number | null;
  retentionDays: number;
  infrastructureNote: string;
}> {
  const [lastSuccess, lastFailure, lastAny] = await Promise.all([
    prisma.backupRun.findFirst({ where: { status: BackupRunStatus.SUCCESS }, orderBy: { finishedAt: "desc" } }),
    prisma.backupRun.findFirst({ where: { status: BackupRunStatus.FAILED }, orderBy: { finishedAt: "desc" } }),
    prisma.backupRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const infrastructureAvailable = env.backupEnabled && lastSuccess !== null;
  return {
    enabled: env.backupEnabled,
    status: publicBackupStatus({
      enabled: env.backupEnabled,
      lastSuccessAt: lastSuccess?.finishedAt ?? null,
      lastFailureAt: lastFailure?.finishedAt ?? null,
      lastStatus: lastAny?.status ?? null,
      infrastructureAvailable,
    }),
    lastSuccessfulAt: lastSuccess?.finishedAt?.toISOString() ?? null,
    lastFailedAt: lastFailure?.finishedAt?.toISOString() ?? null,
    lastSizeBytes: lastSuccess?.sizeBytes ?? null,
    retentionDays: env.backupRetentionDays,
    infrastructureNote: env.backupEnabled
      ? "pg_dump must be on the API host PATH. This process is not a substitute for WAL/PITR."
      : "Automated backup is disabled. Use an operator-managed PostgreSQL backup in production.",
  };
}

async function applyRetention(actor?: ActorContext): Promise<void> {
  const rows = await prisma.backupRun.findMany({
    where: { status: { in: [BackupRunStatus.SUCCESS, BackupRunStatus.FAILED] } },
    select: { id: true, status: true, startedAt: true, keep: true, relativeName: true },
  });
  const deleteIds = backupsEligibleForDeletion(
    rows.map((row) => ({
      id: row.id,
      status: row.status === BackupRunStatus.SUCCESS ? "SUCCESS" : "FAILED",
      startedAt: row.startedAt,
      keep: row.keep,
    })),
    env.backupRetentionDays,
  );
  for (const id of deleteIds) {
    const row = rows.find((item) => item.id === id);
    if (row?.relativeName) {
      await unlink(path.join(env.backupDirectory, row.relativeName)).catch(() => undefined);
    }
    await prisma.backupRun.delete({ where: { id } });
    writeLog("info", "backup_retention_deleted", { runId: id });
    if (actor) {
      await writeAudit({
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.BACKUP_RETENTION_DELETED,
        entityType: "BackupRun",
        entityId: id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
    }
  }
}

export function toPublicBackupRun(row: {
  id: string;
  status: BackupRunStatus;
  trigger: BackupTrigger;
  startedAt: Date;
  finishedAt: Date | null;
  verifiedAt: Date | null;
  sizeBytes: number | null;
  relativeName: string | null;
  errorCode: string | null;
}): PublicBackupRun {
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    sizeBytes: row.sizeBytes,
    relativeName: row.relativeName,
    errorCode: row.errorCode,
  };
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

