import { env } from "../../config/env.js";
import { SimulatedWeighbridgeProvider } from "./simulatedWeighbridgeProvider.js";
import type { WeighbridgeReader } from "./types.js";

export type { WeighbridgeReadResult, WeighbridgeReader } from "./types.js";
export type { IWeightProvider } from "./provider.js";
export { getConnectionManager, setConnectionManager } from "./connectionManager.js";

let reader: WeighbridgeReader = new SimulatedWeighbridgeProvider(env.weighmentSimulatedKg);

export function getWeighbridgeReader(): WeighbridgeReader {
  return reader;
}

export function setWeighbridgeReader(next: WeighbridgeReader): void {
  reader = next;
}
