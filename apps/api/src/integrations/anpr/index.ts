import { env } from "../../config/env.js";
import type { AnprProviderTypeValue } from "../../domain/cameraConfig.js";
import type { IAnprProvider } from "./provider.js";
import { SimulatedAnprProvider } from "./simulatedAnprProvider.js";
import type { AnprReader } from "./types.js";

export type { AnprReadInput, AnprReadResult, AnprReader } from "./types.js";
export type { IAnprProvider } from "./provider.js";

const simulated = new SimulatedAnprProvider(env.anprSimulatedPlates, {
  highMin: env.anprHighConfidenceMin,
  mediumMin: env.anprMediumConfidenceMin,
});

let reader: AnprReader = simulated;

export function getAnprReader(): AnprReader {
  return reader;
}

export function setAnprReader(next: AnprReader): void {
  reader = next;
}

export function getAnprProvider(providerType: AnprProviderTypeValue = "SIMULATOR"): IAnprProvider {
  if (providerType !== "SIMULATOR") {
    return unavailableAnprProvider(providerType);
  }
  return simulated;
}

function unavailableAnprProvider(providerType: string): IAnprProvider {
  return {
    async initialize() {
      return;
    },
    async recognize() {
      throw new Error(`ANPR provider ${providerType} is not configured. Use the simulator.`);
    },
    getStatus() {
      return {
        status: "UNAVAILABLE",
        provider: providerType,
        simulated: false,
        lastError: "This ANPR vendor adapter is not deployed",
      };
    },
    async shutdown() {
      return;
    },
  };
}
