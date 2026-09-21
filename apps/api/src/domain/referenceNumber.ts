const PREFIX = "TRN";

export function formatReferenceNumber(year: number, sequence: number): string {
  return `${PREFIX}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function referencePrefix(year: number): string {
  return `${PREFIX}-${year}-`;
}

export function parseReferenceSequence(reference: string, year: number): number | null {
  const match = new RegExp(`^${PREFIX}-${year}-(\\d{6})$`).exec(reference);
  if (!match) {
    return null;
  }

  const value = match[1];
  if (value === undefined) {
    return null;
  }

  return Number(value);
}
