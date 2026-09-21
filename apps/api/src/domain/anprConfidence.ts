export const ANPR_CONFIDENCE_BANDS = ["HIGH", "MEDIUM", "LOW", "NONE"] as const;
export type AnprConfidenceBand = (typeof ANPR_CONFIDENCE_BANDS)[number];

export type AnprConfidenceThresholds = {
  highMin: number;
  mediumMin: number;
};

export const DEFAULT_ANPR_THRESHOLDS: AnprConfidenceThresholds = {
  highMin: 0.9,
  mediumMin: 0.7,
};

export function parseConfidenceThresholds(input: {
  highMin?: number | undefined;
  mediumMin?: number | undefined;
}): AnprConfidenceThresholds | string {
  const highMin = input.highMin ?? DEFAULT_ANPR_THRESHOLDS.highMin;
  const mediumMin = input.mediumMin ?? DEFAULT_ANPR_THRESHOLDS.mediumMin;
  if (!isUnitInterval(highMin) || !isUnitInterval(mediumMin)) {
    return "Confidence thresholds must be between 0 and 1";
  }
  if (mediumMin > highMin) {
    return "Medium confidence threshold cannot be higher than the high threshold";
  }
  return { highMin, mediumMin };
}

export function classifyAnprConfidence(
  confidence: number | null,
  thresholds: AnprConfidenceThresholds = DEFAULT_ANPR_THRESHOLDS,
): AnprConfidenceBand {
  if (confidence === null || !Number.isFinite(confidence) || confidence <= 0) {
    return "NONE";
  }

  if (confidence >= thresholds.highMin) {
    return "HIGH";
  }
  if (confidence >= thresholds.mediumMin) {
    return "MEDIUM";
  }
  return "LOW";
}

export function formatConfidencePercent(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) {
    return "—";
  }
  return `${Math.round(confidence * 100)}%`;
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
