export const METROLOGY_NOTICE =
  "Trinetra reads the indicator's official measurement. It does not apply software weight offsets or legally calibrate the weighbridge.";

export function rejectWeightOffset(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).map((key) => key.toLowerCase());
  const offsetKey = keys.find((key) =>
    ["offset", "offsetkg", "weightoffset", "correction", "correctionkg", "calibrationoffset"].includes(key),
  );
  return offsetKey
    ? "Software weight offsets are not permitted. Trinetra reads the indicator measurement only."
    : null;
}
