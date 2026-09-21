import { TransactionStatus } from "@prisma/client";

export function assertTransactionMutable(status: TransactionStatus): string | null {
  if (status === TransactionStatus.COMPLETED) {
    return "Completed transactions cannot be changed. Request a controlled correction.";
  }

  if (status === TransactionStatus.CANCELLED) {
    return "This transaction is cancelled";
  }

  return null;
}

export function isBlockingExceptionStatus(status: TransactionStatus): boolean {
  return status === TransactionStatus.EXCEPTION;
}
