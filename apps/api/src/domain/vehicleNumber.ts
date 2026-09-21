export type VehicleNumberLimits = {
  minLength: number;
  maxLength: number;
};

export const DEFAULT_VEHICLE_NUMBER_LIMITS: VehicleNumberLimits = {
  minLength: 4,
  maxLength: 15,
};

export function normalizeRegistrationNumber(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function displayRegistrationNumber(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed === "") {
    return "";
  }

  return trimmed.toUpperCase();
}

export function validateRegistrationNumber(
  normalized: string,
  limits: VehicleNumberLimits = DEFAULT_VEHICLE_NUMBER_LIMITS,
): string | null {
  if (normalized.length < limits.minLength || normalized.length > limits.maxLength) {
    return `Vehicle number must be ${limits.minLength}–${limits.maxLength} letters or digits`;
  }

  if (!/^[A-Z0-9]+$/.test(normalized)) {
    return "Vehicle number may contain only letters and digits";
  }

  return null;
}
