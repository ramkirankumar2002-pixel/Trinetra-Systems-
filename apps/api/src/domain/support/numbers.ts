export function formatSupportNumber(prefix: "SUP" | "MNT", year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function supportNumberPrefix(prefix: "SUP" | "MNT", year: number): string {
  return `${prefix}-${year}-`;
}

export function parseSupportSequence(value: string, prefix: "SUP" | "MNT", year: number): number | null {
  const match = new RegExp(`^${prefix}-${year}-(\\d{6})$`).exec(value);
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }
  return Number(digits);
}
