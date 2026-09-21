export type WeighbridgeOperationalStatus = "AVAILABLE" | "BUSY" | "MAINTENANCE" | "OFFLINE";

export function deriveWeighbridgeStatus(input: {
  isActive: boolean;
  hasActiveMaintenance: boolean;
  hasOpenTransaction: boolean;
}): WeighbridgeOperationalStatus {
  if (!input.isActive) {
    return "OFFLINE";
  }

  if (input.hasActiveMaintenance) {
    return "MAINTENANCE";
  }

  if (input.hasOpenTransaction) {
    return "BUSY";
  }

  return "AVAILABLE";
}
