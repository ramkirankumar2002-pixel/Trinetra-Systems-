import { DEFAULT_ANPR_THRESHOLDS, type AnprConfidenceThresholds } from "../../domain/anprConfidence.js";
import type { AnprProviderSnapshot } from "../../domain/anprResult.js";
import type { CameraSimulatorScenario } from "../../domain/cameraConfig.js";
import { displayRegistrationNumber, normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import type { CameraFrame } from "../cameras/types.js";
import type { IAnprProvider } from "./provider.js";
import { buildSimulatedAnprResult, SIMULATED_ANPR_PROVIDER } from "./scenarios.js";
import type { AnprReadInput, AnprReadResult, AnprReader } from "./types.js";

const DEFAULT_PLATES = ["AP39XX1234", "MH12AB1234", "TS09EA1234"];

export class SimulatedAnprProvider implements AnprReader, IAnprProvider {
  private status: AnprProviderSnapshot["status"] = "UNAVAILABLE";
  private lastError: string | null = null;

  constructor(
    private readonly plates: string[] = DEFAULT_PLATES,
    private readonly thresholds: AnprConfidenceThresholds = DEFAULT_ANPR_THRESHOLDS,
  ) {}

  async initialize(): Promise<void> {
    this.status = "READY";
    this.lastError = null;
  }

  async shutdown(): Promise<void> {
    this.status = "UNAVAILABLE";
  }

  getStatus(): AnprProviderSnapshot {
    return {
      status: this.status,
      provider: SIMULATED_ANPR_PROVIDER,
      simulated: true,
      lastError: this.lastError,
    };
  }

  async readPlate(input: AnprReadInput): Promise<AnprReadResult> {
    const catalog = this.plates.length > 0 ? this.plates : DEFAULT_PLATES;
    const index = hashString(input.weighbridgeId + String(Math.floor(Date.now() / 15_000))) % catalog.length;
    const raw = catalog[index] ?? "AP39XX1234";
    const plate = normalizeRegistrationNumber(raw);

    return {
      plate,
      displayPlate: displayRegistrationNumber(raw),
      confidence: 0.86,
      source: "SIMULATED",
      provider: SIMULATED_ANPR_PROVIDER,
      readAt: new Date().toISOString(),
    };
  }

  async recognize(frame: CameraFrame): Promise<import("../../domain/anprResult.js").NormalizedAnprResult> {
    this.status = "PROCESSING";
    const started = Date.now();
    try {
      const scenario = resolveScenario(frame.scenario);
      const result = buildSimulatedAnprResult({
        scenario,
        capturedAt: frame.capturedAt,
        imageStorageKey: null,
        thresholds: this.thresholds,
        processingDurationMs: Math.max(1, Date.now() - started),
      });
      this.status = "READY";
      this.lastError = null;
      return result;
    } catch (error) {
      this.status = "ERROR";
      this.lastError = error instanceof Error ? error.message : "Simulated ANPR failed";
      throw error;
    }
  }
}

function resolveScenario(value: CameraSimulatorScenario | undefined): CameraSimulatorScenario {
  return value ?? "HIGH_KNOWN";
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
