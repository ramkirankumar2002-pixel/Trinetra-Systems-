import { isApiError } from "../../shared/api/client.ts";
import type { PublicTransaction } from "../transactions/api.ts";
import type { TranslationKey } from "./translations.ts";

export const DRIVER_SCREENS = [
  "LANGUAGE",
  "VEHICLE",
  "DOCUMENT",
  "MATERIAL",
  "FIRST_WEIGHMENT",
  "APPROVAL",
  "UNLOADING",
  "UNLOADING_PROGRESS",
  "SECOND_WEIGHMENT",
  "COMPLETED",
  "EXCEPTION",
] as const;

export type DriverScreen = (typeof DRIVER_SCREENS)[number];

export const DRIVER_PROGRESS_STEPS = [
  "VEHICLE",
  "DOCUMENT",
  "FIRST_WEIGHMENT",
  "APPROVAL",
  "UNLOADING",
  "SECOND_WEIGHMENT",
  "COMPLETED",
] as const;

export type DriverProgressStep = (typeof DRIVER_PROGRESS_STEPS)[number];

export type DriverConnectivityTone = "ONLINE" | "OFFLINE" | "SYNCING" | "SYNCED" | "ERROR";

export type DriverConnectivityInput = {
  navigatorOnline: boolean;
  fetchFailed: boolean;
  internetStatus?: string;
  backendStatus?: string;
  syncStatus?: string;
  lastError?: string | null;
  queued?: number;
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "CANCELLED"]);
const EXCEPTION_STATUSES = new Set(["EXCEPTION", "REJECTED", "ON_HOLD"]);

export function resolveDriverScreen(input: {
  languageChosen: boolean;
  transaction: Pick<PublicTransaction, "status" | "nextAction"> | null;
  skippedOptionalDocument?: boolean;
}): DriverScreen {
  if (!input.languageChosen) {
    return "LANGUAGE";
  }

  const transaction = input.transaction;
  if (!transaction) {
    return "VEHICLE";
  }

  if (EXCEPTION_STATUSES.has(transaction.status) || isExceptionAction(transaction.nextAction.code)) {
    return "EXCEPTION";
  }

  if (TERMINAL_STATUSES.has(transaction.status) || transaction.nextAction.code === "completed") {
    return "COMPLETED";
  }

  if (
    input.skippedOptionalDocument === true &&
    transaction.nextAction.code === "upload_document" &&
    !transaction.nextAction.blocking
  ) {
    return "FIRST_WEIGHMENT";
  }

  return screenFromNextAction(transaction.nextAction.code, transaction.status);
}

function isExceptionAction(code: string): boolean {
  return code === "blocked" || code === "review_exception";
}

function screenFromNextAction(code: string, status: string): DriverScreen {
  switch (code) {
    case "identify":
      return "VEHICLE";
    case "upload_document":
      return "DOCUMENT";
    case "assign_material":
    case "verify_material":
      return "MATERIAL";
    case "record_gross":
      return "FIRST_WEIGHMENT";
    case "await_approval":
      return "APPROVAL";
    case "assign_unloading":
    case "start_unloading":
      return "UNLOADING";
    case "complete_unloading":
      return "UNLOADING_PROGRESS";
    case "record_tare":
    case "finalize":
      return "SECOND_WEIGHMENT";
    case "completed":
      return "COMPLETED";
    case "blocked":
    case "review_exception":
      return "EXCEPTION";
    case "continue":
      return screenFromStatus(status);
    default:
      return screenFromStatus(status);
  }
}

export function screenFromStatus(status: string): DriverScreen {
  switch (status) {
    case "ARRIVED":
      return "VEHICLE";
    case "IDENTIFIED":
    case "DOCUMENT_PENDING":
      return "DOCUMENT";
    case "DOCUMENT_VERIFIED":
    case "MATERIAL_CLASSIFIED":
      return "MATERIAL";
    case "FIRST_WEIGHMENT":
      return "FIRST_WEIGHMENT";
    case "PENDING_APPROVAL":
      return "APPROVAL";
    case "APPROVED":
      return "UNLOADING";
    case "UNLOADING":
      return "UNLOADING_PROGRESS";
    case "UNLOADED":
    case "SECOND_WEIGHMENT":
      return "SECOND_WEIGHMENT";
    case "COMPLETED":
    case "CANCELLED":
      return "COMPLETED";
    case "ON_HOLD":
    case "REJECTED":
    case "EXCEPTION":
      return "EXCEPTION";
    default:
      return "VEHICLE";
  }
}

export function progressStepForScreen(screen: DriverScreen): DriverProgressStep {
  switch (screen) {
    case "LANGUAGE":
    case "VEHICLE":
      return "VEHICLE";
    case "DOCUMENT":
    case "MATERIAL":
      return "DOCUMENT";
    case "FIRST_WEIGHMENT":
      return "FIRST_WEIGHMENT";
    case "APPROVAL":
      return "APPROVAL";
    case "UNLOADING":
    case "UNLOADING_PROGRESS":
      return "UNLOADING";
    case "SECOND_WEIGHMENT":
      return "SECOND_WEIGHMENT";
    case "COMPLETED":
      return "COMPLETED";
    case "EXCEPTION":
      return "FIRST_WEIGHMENT";
    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

export function progressLabelKey(step: DriverProgressStep): TranslationKey {
  switch (step) {
    case "VEHICLE":
      return "stepVehicle";
    case "DOCUMENT":
      return "stepDocument";
    case "FIRST_WEIGHMENT":
      return "stepWeigh";
    case "APPROVAL":
      return "stepApproval";
    case "UNLOADING":
      return "stepUnload";
    case "SECOND_WEIGHMENT":
      return "stepFinalWeigh";
    case "COMPLETED":
      return "stepComplete";
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

export function helpKeyForScreen(screen: DriverScreen): TranslationKey {
  switch (screen) {
    case "LANGUAGE":
    case "VEHICLE":
      return "helpVehicle";
    case "DOCUMENT":
    case "MATERIAL":
      return "helpDocument";
    case "FIRST_WEIGHMENT":
      return "helpWeigh";
    case "APPROVAL":
      return "helpApproval";
    case "UNLOADING":
    case "UNLOADING_PROGRESS":
      return "helpUnload";
    case "SECOND_WEIGHMENT":
    case "COMPLETED":
      return "helpComplete";
    case "EXCEPTION":
      return "helpWeigh";
    default: {
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

export function weightStatusKey(quality: string): TranslationKey {
  switch (quality) {
    case "STABLE":
      return "weightStable";
    case "UNSTABLE":
      return "weightUnstable";
    case "INVALID":
    case "DEVICE_ERROR":
      return "weightException";
    case "NO_DATA":
    default:
      return "weightReading";
  }
}

export function friendlyDriverErrorKey(error: unknown): TranslationKey {
  if (!isApiError(error)) {
    return "genericError";
  }

  if (error.status === 401 || error.status === 403) {
    return "notAuthorized";
  }
  if (error.status === 409) {
    return "transactionUpdatedRefresh";
  }

  const message = error.message.toLowerCase();
  if (message.includes("authoriz")) {
    return "notAuthorized";
  }
  if (message.includes("weight") || message.includes("weighbridge") || message.includes("stable")) {
    return "weightUnavailable";
  }
  if (message.includes("approval") && message.includes("reject")) {
    return "approvalNotGranted";
  }
  return "genericError";
}

export function exceptionCopy(transaction: Pick<PublicTransaction, "status" | "nextAction" | "exceptionReason">): {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  contactKey: TranslationKey;
} {
  if (transaction.status === "REJECTED" || transaction.nextAction.code === "blocked") {
    return { titleKey: "problemDetected", bodyKey: "approvalNotGranted", contactKey: "contactStoreOfficer" };
  }
  if (transaction.status === "EXCEPTION" || transaction.nextAction.code === "review_exception") {
    return { titleKey: "problemDetected", bodyKey: "unusualWeight", contactKey: "contactSupervisor" };
  }
  return { titleKey: "problemDetected", bodyKey: "waitForOfficer", contactKey: "contactSupervisor" };
}

export function resolveConnectivityTone(input: DriverConnectivityInput): DriverConnectivityTone {
  if (
    input.fetchFailed ||
    !input.navigatorOnline ||
    input.internetStatus === "OFFLINE" ||
    input.backendStatus === "UNREACHABLE"
  ) {
    return "OFFLINE";
  }
  if (input.lastError) {
    return "ERROR";
  }
  if (input.syncStatus === "SYNCING") {
    return "SYNCING";
  }
  if (input.syncStatus === "SYNCED" || (input.queued === 0 && input.syncStatus === "IDLE")) {
    return input.queued === 0 ? "SYNCED" : "ONLINE";
  }
  return "ONLINE";
}

export function connectivityLabelKey(tone: DriverConnectivityTone): TranslationKey {
  switch (tone) {
    case "ONLINE":
      return "online";
    case "OFFLINE":
      return "offlineSaved";
    case "SYNCING":
      return "syncing";
    case "SYNCED":
      return "synced";
    case "ERROR":
      return "connectionError";
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

export type DriverOfflineAction = "APPROVAL" | "FINALIZE" | "CONFIG" | "BASIC";

export function driverOfflineGuidance(
  action: DriverOfflineAction,
  online: boolean,
): { allowed: boolean; messageKey: TranslationKey } | null {
  if (online) {
    return null;
  }
  switch (action) {
    case "APPROVAL":
      return { allowed: false, messageKey: "offlineApprovalBlocked" };
    case "FINALIZE":
      return { allowed: false, messageKey: "offlineActionBlocked" };
    case "CONFIG":
      return { allowed: false, messageKey: "offlineActionBlocked" };
    case "BASIC":
      return null;
    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

export function shouldConfirmTransactionSwitch(currentId: string | null, nextId: string): boolean {
  return currentId !== null && currentId !== "" && currentId !== nextId;
}

export function hasOpenDriverTransaction(
  open: Array<{ id: string }>,
  currentId: string | null,
): { id: string } | null {
  const first = open[0];
  if (!first) {
    return null;
  }
  if (currentId && open.some((item) => item.id === currentId)) {
    return { id: currentId };
  }
  return first;
}

export function simulatedInvoiceFile(): File {
  const content = "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
  return new File([content], "invoice.pdf", { type: "application/pdf" });
}
