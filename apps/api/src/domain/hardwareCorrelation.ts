export type CorrelatableTransaction = {
  id: string;
  siteId: string;
  weighbridgeId: string | null;
};

export function correlateHardwareEvent(input: {
  transactionId: string | null;
  requireTransaction: boolean;
  deviceSiteId: string;
  deviceWeighbridgeId: string | null;
  transaction: CorrelatableTransaction | null;
}): string | null {
  if (!input.transactionId) {
    return input.requireTransaction
      ? "A transaction ID is required. Events are not combined by timestamp proximity."
      : null;
  }
  if (!input.transaction) {
    return "Transaction was not found for this hardware event";
  }
  if (input.transaction.id !== input.transactionId) {
    return "Transaction ID does not match the loaded transaction";
  }
  if (input.transaction.siteId !== input.deviceSiteId) {
    return "Event site does not match the transaction";
  }
  if (
    input.deviceWeighbridgeId &&
    input.transaction.weighbridgeId &&
    input.deviceWeighbridgeId !== input.transaction.weighbridgeId
  ) {
    return "Event weighbridge does not match the transaction";
  }
  return null;
}
