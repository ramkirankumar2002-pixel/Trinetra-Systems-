import type { TransactionStatus } from "@prisma/client";
import type { WeighbridgePlatformState } from "./types.js";

const WEIGHING_STATUSES: TransactionStatus[] = [
  "ARRIVED",
  "IDENTIFIED",
  "DOCUMENT_PENDING",
  "DOCUMENT_VERIFIED",
  "MATERIAL_CLASSIFIED",
  "FIRST_WEIGHMENT",
  "PENDING_APPROVAL",
  "SECOND_WEIGHMENT",
];

const VEHICLE_PRESENT_STATUSES: TransactionStatus[] = ["ON_HOLD", "EXCEPTION", "REJECTED"];

export function derivePlatformState(input: {
  hasActiveMaintenance: boolean;
  openTransactionStatus: TransactionStatus | null;
}): WeighbridgePlatformState {
  if (input.hasActiveMaintenance) {
    return "MAINTENANCE";
  }

  const status = input.openTransactionStatus;
  if (status === null) {
    return "EMPTY";
  }

  switch (status) {
    case "UNLOADING":
      return "UNLOADING";
    case "UNLOADED":
    case "APPROVED":
      return "WAITING_FOR_TARE";
    case "ARRIVED":
    case "IDENTIFIED":
    case "DOCUMENT_PENDING":
    case "DOCUMENT_VERIFIED":
    case "MATERIAL_CLASSIFIED":
    case "FIRST_WEIGHMENT":
    case "PENDING_APPROVAL":
    case "SECOND_WEIGHMENT":
      return "WEIGHING";
    case "ON_HOLD":
    case "EXCEPTION":
    case "REJECTED":
      return "VEHICLE_PRESENT";
    case "COMPLETED":
    case "CANCELLED":
      return "EMPTY";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function weighingStatuses(): TransactionStatus[] {
  return WEIGHING_STATUSES;
}

export function vehiclePresentStatuses(): TransactionStatus[] {
  return VEHICLE_PRESENT_STATUSES;
}

export function platformAllowsEmptyRule(state: WeighbridgePlatformState): boolean {
  return state === "EMPTY";
}

export function platformExpectsMotion(state: WeighbridgePlatformState): boolean {
  return state === "WEIGHING" || state === "UNLOADING" || state === "VEHICLE_PRESENT";
}
