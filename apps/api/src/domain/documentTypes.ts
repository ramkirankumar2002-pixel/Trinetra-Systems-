export const DEFAULT_DOCUMENT_TYPES = [
  "INVOICE",
  "DELIVERY_CHALLAN",
  "PURCHASE_DOCUMENT",
  "GATE_PASS",
  "OTHER",
] as const;

export type DocumentTypeCode = (typeof DEFAULT_DOCUMENT_TYPES)[number] | string;

const DOCUMENT_TYPE_PATTERN = /^[A-Z][A-Z0-9_]{1,39}$/;

export function normalizeDocumentType(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function isAllowedDocumentType(code: string, catalog: readonly string[]): boolean {
  return catalog.includes(code);
}

export function validateDocumentTypeCatalog(values: readonly string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    const code = normalizeDocumentType(value);
    if (!DOCUMENT_TYPE_PATTERN.test(code)) {
      throw new Error(`Invalid document type code: ${value}`);
    }
    if (!unique.includes(code)) {
      unique.push(code);
    }
  }

  if (unique.length === 0) {
    throw new Error("At least one document type is required");
  }

  return unique;
}

export function documentTypeLabel(code: string): string {
  return code
    .split("_")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
