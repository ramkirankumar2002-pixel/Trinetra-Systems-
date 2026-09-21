const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,128}$/;

export function isUsableRequestId(value: string | undefined): value is string {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function formatReferenceId(requestId: string): string {
  const compact = requestId.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8);
  return `REQ-${compact.padEnd(8, "0")}`;
}
