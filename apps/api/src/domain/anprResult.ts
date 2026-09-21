import type { AnprConfidenceBand } from "./anprConfidence.js";

export const ANPR_RESULT_SOURCES = ["SIMULATED", "HARDWARE", "MANUAL"] as const;
export type AnprResultSource = (typeof ANPR_RESULT_SOURCES)[number];

export type AnprBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnprCandidate = {
  plateNumber: string;
  normalizedPlateNumber: string;
  confidence: number;
  boundingBox?: AnprBoundingBox | undefined;
};

export type NormalizedAnprResult = {
  plateNumber: string | null;
  normalizedPlateNumber: string | null;
  displayPlateNumber: string | null;
  confidence: number | null;
  confidenceBand: AnprConfidenceBand;
  timestamp: string;
  provider: string;
  source: AnprResultSource;
  simulated: boolean;
  imageStorageKey: string | null;
  countryRegion: string | null;
  boundingBox: AnprBoundingBox | null;
  candidates: AnprCandidate[];
  processingDurationMs: number;
};

export type AnprProviderStatusValue = "READY" | "PROCESSING" | "ERROR" | "UNAVAILABLE";

export type AnprProviderSnapshot = {
  status: AnprProviderStatusValue;
  provider: string;
  simulated: boolean;
  lastError: string | null;
};
