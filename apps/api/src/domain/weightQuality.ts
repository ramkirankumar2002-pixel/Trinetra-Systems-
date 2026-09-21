export const WEIGHT_QUALITIES = ["STABLE", "UNSTABLE", "INVALID", "NO_DATA", "DEVICE_ERROR"] as const;
export type WeightQuality = (typeof WEIGHT_QUALITIES)[number];

export function isWeightQuality(value: string): value is WeightQuality {
  return (WEIGHT_QUALITIES as readonly string[]).includes(value);
}

export function isOfficialWeighmentQuality(quality: WeightQuality): boolean {
  return quality === "STABLE";
}

export function weighmentQualityMessage(quality: WeightQuality): string {
  switch (quality) {
    case "STABLE":
      return "Weight reading is stable";
    case "UNSTABLE":
    case "INVALID":
    case "NO_DATA":
    case "DEVICE_ERROR":
      return "Stable weight reading is not available.";
    default: {
      const _exhaustive: never = quality;
      return _exhaustive;
    }
  }
}
