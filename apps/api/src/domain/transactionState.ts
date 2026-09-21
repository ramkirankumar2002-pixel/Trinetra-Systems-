import { TransactionStatus } from "@prisma/client";

const TERMINAL: TransactionStatus[] = [
  TransactionStatus.COMPLETED,
  TransactionStatus.REJECTED,
  TransactionStatus.CANCELLED,
];

/**
 * Full platform graph. Step 5 kept IDENTIFIED → FIRST_WEIGHMENT so first
 * weighment still works without documents. Step 6 adds the document path:
 * IDENTIFIED → DOCUMENT_PENDING → DOCUMENT_VERIFIED → FIRST_WEIGHMENT.
 * MATERIAL_CLASSIFIED is used when a material workflow snapshot is applied.
 */
const ALLOWED: Record<TransactionStatus, TransactionStatus[]> = {
  ARRIVED: [TransactionStatus.IDENTIFIED, TransactionStatus.ON_HOLD, TransactionStatus.CANCELLED, TransactionStatus.EXCEPTION],
  IDENTIFIED: [
    TransactionStatus.FIRST_WEIGHMENT,
    TransactionStatus.DOCUMENT_PENDING,
    TransactionStatus.MATERIAL_CLASSIFIED,
    TransactionStatus.ON_HOLD,
    TransactionStatus.CANCELLED,
  ],
  DOCUMENT_PENDING: [
    TransactionStatus.DOCUMENT_VERIFIED,
    TransactionStatus.ON_HOLD,
    TransactionStatus.REJECTED,
    TransactionStatus.CANCELLED,
  ],
  DOCUMENT_VERIFIED: [
    TransactionStatus.FIRST_WEIGHMENT,
    TransactionStatus.MATERIAL_CLASSIFIED,
    TransactionStatus.ON_HOLD,
  ],
  MATERIAL_CLASSIFIED: [TransactionStatus.FIRST_WEIGHMENT, TransactionStatus.ON_HOLD, TransactionStatus.CANCELLED],
  FIRST_WEIGHMENT: [
    TransactionStatus.PENDING_APPROVAL,
    TransactionStatus.UNLOADING,
    TransactionStatus.ON_HOLD,
    TransactionStatus.EXCEPTION,
  ],
  PENDING_APPROVAL: [
    TransactionStatus.APPROVED,
    TransactionStatus.ON_HOLD,
    TransactionStatus.REJECTED,
    TransactionStatus.CANCELLED,
  ],
  APPROVED: [TransactionStatus.UNLOADING, TransactionStatus.ON_HOLD, TransactionStatus.EXCEPTION],
  UNLOADING: [TransactionStatus.UNLOADED, TransactionStatus.ON_HOLD, TransactionStatus.EXCEPTION],
  UNLOADED: [TransactionStatus.SECOND_WEIGHMENT, TransactionStatus.EXCEPTION],
  SECOND_WEIGHMENT: [TransactionStatus.COMPLETED, TransactionStatus.EXCEPTION],
  COMPLETED: [],
  ON_HOLD: [
    TransactionStatus.IDENTIFIED,
    TransactionStatus.DOCUMENT_PENDING,
    TransactionStatus.PENDING_APPROVAL,
    TransactionStatus.UNLOADING,
    TransactionStatus.CANCELLED,
  ],
  REJECTED: [],
  CANCELLED: [],
  EXCEPTION: [],
};

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminalStatus(status: TransactionStatus): boolean {
  return TERMINAL.includes(status);
}

export function isOpenWeighbridgeStatus(status: TransactionStatus): boolean {
  return !TERMINAL.includes(status);
}

export type TransactionAction = "identify" | "record_gross" | "upload_document";

export function allowedActions(status: TransactionStatus, hasGross: boolean): TransactionAction[] {
  const actions: TransactionAction[] = [];
  if (status === TransactionStatus.ARRIVED) {
    actions.push("identify");
  }
  if (
    (status === TransactionStatus.IDENTIFIED || status === TransactionStatus.DOCUMENT_PENDING) &&
    !hasGross
  ) {
    actions.push("upload_document");
  }
  if (
    (status === TransactionStatus.IDENTIFIED || status === TransactionStatus.DOCUMENT_VERIFIED) &&
    !hasGross
  ) {
    actions.push("record_gross");
  }
  return actions;
}
