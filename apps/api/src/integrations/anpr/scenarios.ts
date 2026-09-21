import { classifyAnprConfidence, type AnprConfidenceThresholds } from "../../domain/anprConfidence.js";
import type { AnprCandidate, NormalizedAnprResult } from "../../domain/anprResult.js";
import type { CameraSimulatorScenario } from "../../domain/cameraConfig.js";
import { displayRegistrationNumber, normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";

export const SIMULATED_ANPR_PROVIDER = "simulated-anpr";

export function buildSimulatedAnprResult(input: {
  scenario: CameraSimulatorScenario;
  capturedAt: string;
  imageStorageKey: string | null;
  thresholds: AnprConfidenceThresholds;
  processingDurationMs: number;
}): NormalizedAnprResult {
  const candidates = candidatesForScenario(input.scenario);
  const top = candidates[0] ?? null;
  const confidence = top?.confidence ?? null;
  const band = classifyAnprConfidence(confidence, input.thresholds);

  return {
    plateNumber: top?.plateNumber ?? null,
    normalizedPlateNumber: top?.normalizedPlateNumber ?? null,
    displayPlateNumber: top ? displayRegistrationNumber(top.plateNumber) : null,
    confidence,
    confidenceBand: band,
    timestamp: input.capturedAt,
    provider: SIMULATED_ANPR_PROVIDER,
    source: "SIMULATED",
    simulated: true,
    imageStorageKey: input.imageStorageKey,
    countryRegion: top ? "IN" : null,
    boundingBox: top?.boundingBox ?? null,
    candidates,
    processingDurationMs: input.processingDurationMs,
  };
}

function candidatesForScenario(scenario: CameraSimulatorScenario): AnprCandidate[] {
  switch (scenario) {
    case "HIGH_KNOWN":
      return [candidate("AP39XX1234", 0.96)];
    case "MEDIUM_KNOWN":
      return [candidate("MH12AB1234", 0.78)];
    case "LOW":
      return [candidate("AP39XX1234", 0.41)];
    case "UNKNOWN":
      return [candidate("KA01ZZ9999", 0.91)];
    case "NO_PLATE":
      return [];
    case "MULTI_CANDIDATE":
      return [candidate("AP39XX1234", 0.72), candidate("MH12AB1234", 0.61), candidate("TS09EA1234", 0.48)];
    default: {
      const exhaustive: never = scenario;
      return exhaustive;
    }
  }
}

function candidate(plate: string, confidence: number): AnprCandidate {
  return {
    plateNumber: plate,
    normalizedPlateNumber: normalizeRegistrationNumber(plate),
    confidence,
    boundingBox: { x: 0.12, y: 0.4, width: 0.4, height: 0.18 },
  };
}
