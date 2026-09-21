export type NetWeightResult = {
  netAsDecimal: string;
  tareExceedsGross: boolean;
  netMilligrams: bigint;
};

const DECIMAL_PATTERN = /^-?\d+(\.\d{1,3})?$/;

export function kgToMilligrams(asDecimal: string): bigint {
  const normalized = asDecimal.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error("Weight must be a decimal kilogram value with up to 3 places");
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const milligrams = BigInt(wholePart ?? "0") * 1000n + BigInt(fractionPart.padEnd(3, "0"));
  return negative ? -milligrams : milligrams;
}

export function milligramsToKgDecimal(milligrams: bigint): string {
  const negative = milligrams < 0n;
  const absolute = negative ? -milligrams : milligrams;
  const whole = absolute / 1000n;
  const fraction = (absolute % 1000n).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function calculateNetWeight(grossAsDecimal: string, tareAsDecimal: string): NetWeightResult {
  const netMilligrams = kgToMilligrams(grossAsDecimal) - kgToMilligrams(tareAsDecimal);
  return {
    netAsDecimal: milligramsToKgDecimal(netMilligrams),
    tareExceedsGross: netMilligrams < 0n,
    netMilligrams,
  };
}
