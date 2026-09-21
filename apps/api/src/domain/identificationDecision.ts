import type { AnprConfidenceBand } from "./anprConfidence.js";

export const IDENTIFICATION_ACTIONS = [
  "CONFIRM",
  "CONFIRMATION_REQUIRED",
  "CORRECTION_REQUIRED",
  "MANUAL_REQUIRED",
  "NO_MATCH",
  "SELECT_CANDIDATE",
] as const;

export type IdentificationAction = (typeof IDENTIFICATION_ACTIONS)[number];

export type IdentificationDecision = {
  action: IdentificationAction;
  message: string;
  autoSelectPlate: boolean;
};

export function decideIdentification(input: {
  confidenceBand: AnprConfidenceBand;
  plateDetected: boolean;
  vehicleMatched: boolean;
  candidateCount: number;
}): IdentificationDecision {
  if (!input.plateDetected || input.confidenceBand === "NONE") {
    return {
      action: "MANUAL_REQUIRED",
      message: "No plate detected. Enter the vehicle number manually.",
      autoSelectPlate: false,
    };
  }

  if (input.candidateCount > 1 && input.confidenceBand !== "HIGH") {
    return {
      action: "SELECT_CANDIDATE",
      message: "Multiple plates were detected. Select the correct number. This is not automatic identity.",
      autoSelectPlate: false,
    };
  }

  if (input.confidenceBand === "LOW") {
    return {
      action: "CORRECTION_REQUIRED",
      message: "Please verify vehicle number. Confidence is too low to accept this plate automatically.",
      autoSelectPlate: false,
    };
  }

  if (!input.vehicleMatched) {
    return {
      action: "NO_MATCH",
      message: "Vehicle not registered. Register the vehicle first if you are authorized, then confirm.",
      autoSelectPlate: input.confidenceBand === "HIGH",
    };
  }

  if (input.confidenceBand === "MEDIUM") {
    return {
      action: "CONFIRMATION_REQUIRED",
      message: "Please verify vehicle number before creating the transaction.",
      autoSelectPlate: false,
    };
  }

  return {
    action: "CONFIRM",
    message: "Vehicle found. Confirm to identify this visit. ANPR is a signal, not proof.",
    autoSelectPlate: true,
  };
}

export function canConfirmWithoutCorrection(band: AnprConfidenceBand): boolean {
  return band === "HIGH" || band === "MEDIUM";
}
