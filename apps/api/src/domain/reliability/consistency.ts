import { ApprovalDecision, TransactionStatus, UnloadingStatus, WeighmentKind } from "@prisma/client";
import { calculateNetWeight } from "../netWeight.js";
import type { ConsistencyFinding } from "./types.js";

export type ConsistencyTransaction = {
  id: string;
  referenceNumber: string;
  status: TransactionStatus;
  netWeightKg: string | null;
  weighments: Array<{ kind: WeighmentKind; weightKg: string }>;
  approvals: Array<{ decision: ApprovalDecision }>;
  unloading: { status: UnloadingStatus } | null;
};

export function checkTransactionConsistency(transaction: ConsistencyTransaction): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const gross = transaction.weighments.find((item) => item.kind === WeighmentKind.GROSS);
  const tare = transaction.weighments.find((item) => item.kind === WeighmentKind.TARE);
  const needsGross = statusAtOrAfter(transaction.status, TransactionStatus.FIRST_WEIGHMENT);
  const needsTare = statusAtOrAfter(transaction.status, TransactionStatus.SECOND_WEIGHMENT);
  const needsUnloading = statusAtOrAfter(transaction.status, TransactionStatus.UNLOADING);
  const needsApproval = transaction.status === TransactionStatus.PENDING_APPROVAL
    || transaction.status === TransactionStatus.APPROVED
    || statusAtOrAfter(transaction.status, TransactionStatus.UNLOADING);

  if (needsGross && !gross) {
    findings.push(finding(transaction, "MISSING_GROSS", "Gross weighment is expected for this status.", "ERROR"));
  }
  if (needsTare && !tare) {
    findings.push(finding(transaction, "MISSING_TARE", "Tare weighment is expected for this status.", "ERROR"));
  }
  if (gross && tare) {
    const net = calculateNetWeight(gross.weightKg, tare.weightKg);
    if (transaction.netWeightKg && transaction.netWeightKg !== net.netAsDecimal) {
      findings.push(
        finding(transaction, "NET_MISMATCH", "Stored net weight does not match the server calculation.", "ERROR"),
      );
    }
  }
  if (needsApproval && !transaction.approvals.some((approval) => approval.decision !== ApprovalDecision.PENDING || transaction.status === TransactionStatus.PENDING_APPROVAL)) {
    if (transaction.status === TransactionStatus.PENDING_APPROVAL && transaction.approvals.every((approval) => approval.decision !== ApprovalDecision.PENDING)) {
      findings.push(finding(transaction, "MISSING_APPROVAL", "A pending approval is expected.", "WARNING"));
    }
  }
  if (
    transaction.status === TransactionStatus.APPROVED ||
    transaction.status === TransactionStatus.UNLOADING ||
    transaction.status === TransactionStatus.UNLOADED ||
    transaction.status === TransactionStatus.SECOND_WEIGHMENT ||
    transaction.status === TransactionStatus.COMPLETED
  ) {
    const approved = transaction.approvals.some((approval) => approval.decision === ApprovalDecision.APPROVED);
    const noApprovalRequired = transaction.approvals.length === 0;
    if (!approved && !noApprovalRequired) {
      findings.push(finding(transaction, "MISSING_APPROVAL", "An approved request is expected after this stage.", "WARNING"));
    }
  }
  if (needsUnloading && !transaction.unloading) {
    findings.push(finding(transaction, "MISSING_UNLOADING", "Unloading is expected for this status.", "WARNING"));
  }
  if (transaction.status === TransactionStatus.COMPLETED) {
    if (!gross || !tare || !transaction.netWeightKg) {
      findings.push(
        finding(transaction, "COMPLETED_INCOMPLETE", "A completed transaction is missing required weight data.", "ERROR"),
      );
    }
    if (transaction.unloading && transaction.unloading.status !== UnloadingStatus.COMPLETED) {
      findings.push(
        finding(transaction, "COMPLETED_INCOMPLETE", "A completed transaction still has unfinished unloading.", "WARNING"),
      );
    }
  }

  return findings;
}

export function checkAuditConsistency(input: {
  transactionId: string;
  referenceNumber: string;
  status: TransactionStatus;
  auditActions: string[];
}): ConsistencyFinding[] {
  const findings: ConsistencyFinding[] = [];
  const required: string[] = ["TRANSACTION_CREATED"];
  if (statusAtOrAfter(input.status, TransactionStatus.FIRST_WEIGHMENT)) {
    required.push("FIRST_WEIGHMENT_RECORDED");
  }
  if (statusAtOrAfter(input.status, TransactionStatus.SECOND_WEIGHMENT)) {
    required.push("SECOND_WEIGHMENT_RECORDED");
  }
  if (input.status === TransactionStatus.COMPLETED) {
    required.push("TRANSACTION_COMPLETED");
  }
  for (const action of required) {
    if (!input.auditActions.includes(action)) {
      findings.push({
        entityType: "Transaction",
        entityId: input.transactionId,
        code: "MISSING_AUDIT",
        severity: "WARNING",
        message: `${input.referenceNumber} has no ${action} audit record. Historical rows are not fabricated.`,
      });
    }
  }
  return findings;
}

function finding(
  transaction: ConsistencyTransaction,
  code: string,
  message: string,
  severity: ConsistencyFinding["severity"],
): ConsistencyFinding {
  return {
    entityType: "Transaction",
    entityId: transaction.id,
    code,
    severity,
    message: `${transaction.referenceNumber}: ${message}`,
  };
}

function statusAtOrAfter(current: TransactionStatus, target: TransactionStatus): boolean {
  const order: TransactionStatus[] = [
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
    TransactionStatus.COMPLETED,
  ];
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);
  if (currentIndex === -1 || targetIndex === -1) {
    return current === target;
  }
  return currentIndex >= targetIndex;
}
