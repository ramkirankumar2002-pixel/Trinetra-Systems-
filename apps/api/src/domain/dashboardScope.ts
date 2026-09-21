import { TransactionStatus } from "@prisma/client";
import type { AuthenticatedUser } from "../modules/auth/types.js";

export const CLOSED_TRANSACTION_STATUSES: TransactionStatus[] = [
  TransactionStatus.COMPLETED,
  TransactionStatus.CANCELLED,
  TransactionStatus.REJECTED,
  TransactionStatus.EXCEPTION,
];

export const LIVE_TRANSACTION_STATUSES: TransactionStatus[] = Object.values(TransactionStatus).filter(
  (status) => !CLOSED_TRANSACTION_STATUSES.includes(status),
);

export const PENDING_UNLOADING_STATUSES: TransactionStatus[] = [
  TransactionStatus.APPROVED,
  TransactionStatus.UNLOADING,
];

export const EXCEPTION_LIST_STATUSES: TransactionStatus[] = [
  TransactionStatus.EXCEPTION,
  TransactionStatus.REJECTED,
  TransactionStatus.ON_HOLD,
];

export type DashboardView = "management" | "weighbridge" | "store" | "site" | "operations";

export type DashboardCapabilities = {
  view: DashboardView;
  kpis: boolean;
  live: boolean;
  recent: boolean;
  pendingApprovals: boolean;
  pendingUnloading: boolean;
  exceptions: boolean;
  alerts: boolean;
  weightAnomalies: boolean;
  charts: boolean;
  reports: boolean;
  audit: boolean;
  reliability: boolean;
};

export type DashboardExceptionType =
  | "WEIGHT_VALIDATION"
  | "TARE_EXCEEDS_GROSS"
  | "MISSING_DOCUMENT"
  | "DOCUMENT_VERIFICATION"
  | "APPROVAL_REJECTED"
  | "WORKFLOW"
  | "MISSING_UNLOADING"
  | "TRANSACTION_EXCEPTION";

export function resolveDashboardCapabilities(user: AuthenticatedUser): DashboardCapabilities {
  const permissions = new Set(user.permissions);
  const roles = user.roles.map((role) => role.code);
  const isAdmin = roles.includes("ADMIN");
  const canReports = isAdmin || permissions.has("report.read");
  const canAudit = isAdmin || permissions.has("audit.read");
  const canApprovals = isAdmin || canReports || permissions.has("approval.decide");
  const canUnloading =
    isAdmin ||
    canReports ||
    permissions.has("unloading.assign") ||
    permissions.has("unloading.manage") ||
    roles.includes("SITE_USER") ||
    roles.includes("PLANT_USER");

  let view: DashboardView = "operations";
  if (isAdmin || roles.includes("OFFICE_MANAGER") || canReports) {
    view = "management";
  } else if (roles.includes("WEIGHBRIDGE_OPERATOR")) {
    view = "weighbridge";
  } else if (roles.includes("STORE_OFFICER")) {
    view = "store";
  } else if (roles.includes("SITE_USER") || roles.includes("PLANT_USER")) {
    view = "site";
  }

  return {
    view,
    kpis: true,
    live: true,
    recent: true,
    pendingApprovals: canApprovals,
    pendingUnloading: canUnloading,
    exceptions: true,
    alerts: true,
    weightAnomalies:
      isAdmin ||
      permissions.has("anomaly.read") ||
      permissions.has("security.read") ||
      permissions.has("weighbridge.read") ||
      permissions.has("dashboard.read"),
    charts: canReports,
    reports: canReports,
    audit: canAudit,
    reliability: isAdmin || permissions.has("reliability.read"),
  };
}

export function canSeeAllSiteApprovals(user: AuthenticatedUser): boolean {
  return user.roles.some((role) => role.code === "ADMIN") || user.permissions.includes("report.read");
}

export function classifyDashboardException(input: {
  status: TransactionStatus;
  exceptionReason: string | null;
  holdReason: string | null;
  hasRejectedDocument: boolean;
  rejectedDocumentType: string | null;
  missingRequiredDocument: boolean;
  approvedWithoutUnloadingPoint: boolean;
  tareExceedsGross: boolean;
}): { type: DashboardExceptionType; message: string } {
  if (input.status === TransactionStatus.EXCEPTION || input.tareExceedsGross) {
    const reason = input.exceptionReason ?? "Weight values need operational review";
    if (input.tareExceedsGross || /tare/i.test(reason)) {
      return { type: "TARE_EXCEEDS_GROSS", message: reason };
    }
    if (/weight/i.test(reason)) {
      return { type: "WEIGHT_VALIDATION", message: reason };
    }
    return { type: "TRANSACTION_EXCEPTION", message: reason };
  }

  if (input.status === TransactionStatus.REJECTED) {
    return {
      type: "APPROVAL_REJECTED",
      message: input.exceptionReason ?? "Approval was rejected. This is an operational block, not a fraud finding.",
    };
  }

  if (input.hasRejectedDocument) {
    return {
      type: "DOCUMENT_VERIFICATION",
      message: input.rejectedDocumentType
        ? `Document verification issue: ${input.rejectedDocumentType}`
        : "A document failed verification",
    };
  }

  if (input.missingRequiredDocument || input.status === TransactionStatus.DOCUMENT_PENDING) {
    return { type: "MISSING_DOCUMENT", message: "Required document has not been captured or verified" };
  }

  if (input.approvedWithoutUnloadingPoint) {
    return { type: "MISSING_UNLOADING", message: "Approved transaction has no unloading point assigned" };
  }

  if (input.status === TransactionStatus.ON_HOLD) {
    return { type: "WORKFLOW", message: input.holdReason ?? "Transaction is on hold" };
  }

  return { type: "WORKFLOW", message: input.exceptionReason ?? "Transaction requires attention" };
}

