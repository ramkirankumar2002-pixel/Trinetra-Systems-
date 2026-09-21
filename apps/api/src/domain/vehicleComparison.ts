import { normalizeRegistrationNumber } from "./vehicleNumber.js";

export type VehicleComparisonResult = "MATCH" | "NEEDS_REVIEW";

export type VehicleComparisonInput = {
  anprVehicleNumber?: string | null | undefined;
  ocrVehicleNumber?: string | null | undefined;
  registeredVehicleNumber?: string | null | undefined;
};

export type VehicleComparison = {
  anprVehicleNumber: string | null;
  ocrVehicleNumber: string | null;
  registeredVehicleNumber: string | null;
  result: VehicleComparisonResult;
  comparedAt: string;
};

export function compareVehicleNumbers(
  input: VehicleComparisonInput,
  comparedAt = new Date().toISOString(),
): VehicleComparison {
  const anpr = normalizeOptionalPlate(input.anprVehicleNumber);
  const ocr = normalizeOptionalPlate(input.ocrVehicleNumber);
  const registered = normalizeOptionalPlate(input.registeredVehicleNumber);
  const present = [anpr, ocr, registered].filter((value): value is string => value !== null);
  const unique = new Set(present);
  const result: VehicleComparisonResult =
    present.length >= 2 && unique.size === 1 ? "MATCH" : "NEEDS_REVIEW";

  return {
    anprVehicleNumber: anpr,
    ocrVehicleNumber: ocr,
    registeredVehicleNumber: registered,
    result,
    comparedAt,
  };
}

function normalizeOptionalPlate(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = normalizeRegistrationNumber(value);
  return normalized === "" ? null : normalized;
}
