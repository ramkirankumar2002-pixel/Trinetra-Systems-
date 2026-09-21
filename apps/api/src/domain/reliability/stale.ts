import { TransactionStatus } from "@prisma/client";
import type { GatewayLivenessStatus, StaleTransactionThresholds } from "./types.js";
import { DEFAULT_STALE_THRESHOLDS } from "./types.js";

export const STALE_ELIGIBLE_STATUSES: TransactionStatus[] = [
  TransactionStatus.ARRIVED,
  TransactionStatus.IDENTIFIED,
  TransactionStatus.DOCUMENT_PENDING,
  TransactionStatus.DOCUMENT_VERIFIED,
  TransactionStatus.MATERIAL_CLASSIFIED,
  TransactionStatus.FIRST_WEIGHMENT,
  TransactionStatus.PENDING_APPROVAL,
  TransactionStatus.APPROVED,
  TransactionStatus.UNLOADING,
  TransactionStatus.UNLOADED,
  TransactionStatus.SECOND_WEIGHMENT,
  TransactionStatus.ON_HOLD,
];

export function staleThresholdHours(
  status: TransactionStatus,
  thresholds: StaleTransactionThresholds = DEFAULT_STALE_THRESHOLDS,
): number | null {
  switch (status) {
    case TransactionStatus.DOCUMENT_PENDING:
      return thresholds.documentPendingHours;
    case TransactionStatus.PENDING_APPROVAL:
      return thresholds.pendingApprovalHours;
    case TransactionStatus.UNLOADING:
    case TransactionStatus.APPROVED:
      return thresholds.unloadingHours;
    case TransactionStatus.UNLOADED:
    case TransactionStatus.SECOND_WEIGHMENT:
      return thresholds.secondWeighmentHours;
    case TransactionStatus.ARRIVED:
    case TransactionStatus.IDENTIFIED:
    case TransactionStatus.DOCUMENT_VERIFIED:
    case TransactionStatus.MATERIAL_CLASSIFIED:
    case TransactionStatus.FIRST_WEIGHMENT:
    case TransactionStatus.ON_HOLD:
      return thresholds.intermediateHours;
    case TransactionStatus.COMPLETED:
    case TransactionStatus.REJECTED:
    case TransactionStatus.CANCELLED:
    case TransactionStatus.EXCEPTION:
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function isStaleTransaction(input: {
  status: TransactionStatus;
  updatedAt: Date;
  now: Date;
  thresholds?: StaleTransactionThresholds;
}): boolean {
  const hours = staleThresholdHours(input.status, input.thresholds ?? DEFAULT_STALE_THRESHOLDS);
  if (hours === null) {
    return false;
  }
  return input.now.getTime() - input.updatedAt.getTime() >= hours * 60 * 60 * 1000;
}

export function classifyGatewayLiveness(input: {
  lastHeartbeatAt: Date | null;
  nowMs: number;
  staleAfterMs: number;
  offlineAfterMs: number;
  enabled: boolean;
  revokedAt: Date | null;
}): GatewayLivenessStatus | "DISABLED" {
  if (input.revokedAt !== null || !input.enabled) {
    return "DISABLED";
  }
  if (input.lastHeartbeatAt === null) {
    return "OFFLINE";
  }
  const age = input.nowMs - input.lastHeartbeatAt.getTime();
  if (age > input.offlineAfterMs) {
    return "OFFLINE";
  }
  if (age > input.staleAfterMs) {
    return "STALE";
  }
  return "ONLINE";
}

export function dayBucket(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
