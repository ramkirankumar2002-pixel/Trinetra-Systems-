import { assertWeightWithinLimits, parseWeightKg, type WeightLimits } from "./weight.js";
import { isDeviceConnected, type HardwareDeviceStatus } from "./hardwareStatus.js";
import { isOfficialWeighmentQuality, weighmentQualityMessage, type WeightQuality } from "./weightQuality.js";
import { isWeightUnit, type WeightUnit } from "./weightUnits.js";

export function officialWeighmentRejection(input: {
  connectionStatus: HardwareDeviceStatus;
  quality: WeightQuality;
  weightKg: string | null;
  unit: string;
  expectedUnit: WeightUnit;
  limits: WeightLimits;
}): string | null {
  if (!isDeviceConnected(input.connectionStatus)) {
    return "Stable weight reading is not available.";
  }
  if (!isOfficialWeighmentQuality(input.quality)) {
    return weighmentQualityMessage(input.quality);
  }
  if (!isWeightUnit(input.unit) || input.unit !== input.expectedUnit) {
    return "Stable weight reading is not available.";
  }
  if (input.weightKg === null) {
    return "Stable weight reading is not available.";
  }

  const parsed = parseWeightKg(input.weightKg);
  if (typeof parsed === "string") {
    return parsed;
  }
  return assertWeightWithinLimits(parsed, input.limits);
}
