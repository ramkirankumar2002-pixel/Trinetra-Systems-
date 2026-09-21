export const DEFAULT_MATERIAL_UNITS = ["KG", "TON", "MT", "LITRE", "PIECE"] as const;

const UNIT_PATTERN = /^[A-Z][A-Z0-9]{0,11}$/;

export function normalizeMaterialUnit(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function validateMaterialUnitCatalog(values: readonly string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    const unit = normalizeMaterialUnit(value);
    if (!UNIT_PATTERN.test(unit)) {
      throw new Error(`Invalid material unit: ${value}`);
    }
    if (!unique.includes(unit)) {
      unique.push(unit);
    }
  }

  if (unique.length === 0) {
    throw new Error("At least one material unit is required");
  }

  return unique;
}

export function isAllowedMaterialUnit(unit: string, catalog: readonly string[]): boolean {
  return catalog.includes(unit);
}
