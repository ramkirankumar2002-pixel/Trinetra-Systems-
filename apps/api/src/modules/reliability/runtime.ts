import { BackupTrigger } from "@prisma/client";
import { env } from "../../config/env.js";
import { writeLog } from "../../lib/logger.js";
import { runConfiguredBackup } from "./backup.js";
import { runReliabilityScan } from "./scanner.js";

let scanTimer: NodeJS.Timeout | undefined;
let backupTimer: NodeJS.Timeout | undefined;

export function startReliabilityRuntime(): void {
  scanTimer = setInterval(() => {
    void runReliabilityScan().catch((error: unknown) => {
      writeLog("error", "reliability_scan_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  }, env.reliabilityScanIntervalMs);
  scanTimer.unref();

  if (env.backupEnabled && env.backupIntervalMs > 0) {
    backupTimer = setInterval(() => {
      void runConfiguredBackup({ trigger: BackupTrigger.SCHEDULED }).catch((error: unknown) => {
        writeLog("error", "scheduled_backup_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });
    }, env.backupIntervalMs);
    backupTimer.unref();
  }
}

export function stopReliabilityRuntime(): void {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = undefined;
  }
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = undefined;
  }
}
