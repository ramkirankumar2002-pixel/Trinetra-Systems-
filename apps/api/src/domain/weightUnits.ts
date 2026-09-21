export const WEIGHT_UNITS = ["KG", "TONNE"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

const MILLIGRAMS_PER_KG = 1000n;
const MILLIGRAMS_PER_TONNE = 1_000_000n;

export function isWeightUnit(value: string): value is WeightUnit {
  return (WEIGHT_UNITS as readonly string[]).includes(value);
}

export function milliKgFromUnit(amountMilliInUnit: bigint, unit: WeightUnit): bigint {
  switch (unit) {
    case "KG":
      return amountMilliInUnit;
    case "TONNE":
      return amountMilliInUnit * (MILLIGRAMS_PER_TONNE / MILLIGRAMS_PER_KG);
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function convertMilliKg(milliKg: bigint, unit: WeightUnit): bigint {
  switch (unit) {
    case "KG":
      return milliKg;
    case "TONNE":
      return milliKg / (MILLIGRAMS_PER_TONNE / MILLIGRAMS_PER_KG);
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

export function unitLabel(unit: WeightUnit): string {
  return unit === "TONNE" ? "t" : "kg";
}
