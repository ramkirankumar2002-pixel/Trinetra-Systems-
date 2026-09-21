export function normalizeMaterialCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function validateMaterialCode(code: string): string | null {
  if (code.length < 2 || code.length > 32) {
    return "Material code must be 2–32 characters";
  }

  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
    return "Material code must start with a letter and use only letters, digits, or underscores";
  }

  return null;
}

export function normalizeMaterialName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}
