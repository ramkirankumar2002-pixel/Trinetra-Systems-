export type WeightLimits = {
  minKg: number;
  maxKg: number;
};

export const DEFAULT_WEIGHT_LIMITS: WeightLimits = {
  minKg: 50,
  maxKg: 120_000,
};

export type ParsedWeight = {
  kg: number;
  asDecimal: string;
};

export function parseWeightKg(value: unknown): ParsedWeight | string {
  if (typeof value === "number") {
    return validateNumericWeight(value);
  }

  if (typeof value !== "string" || value.trim() === "") {
    return "A valid weight is required";
  }

  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) {
    return "Weight must be a positive number in kilograms";
  }

  return validateNumericWeight(Number(normalized), normalized);
}

function validateNumericWeight(value: number, original?: string): ParsedWeight | string {
  if (!Number.isFinite(value)) {
    return "Weight must be a valid number";
  }

  if (value < 0) {
    return "Weight cannot be negative";
  }

  if (value === 0) {
    return "Weight must be greater than zero";
  }

  const asDecimal = original ?? formatDecimal(value);
  return { kg: Number(asDecimal), asDecimal };
}

export function assertWeightWithinLimits(weight: ParsedWeight, limits: WeightLimits): string | null {
  if (weight.kg < limits.minKg || weight.kg > limits.maxKg) {
    return `Weight must be between ${limits.minKg} and ${limits.maxKg} kg`;
  }

  return null;
}

function formatDecimal(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}
