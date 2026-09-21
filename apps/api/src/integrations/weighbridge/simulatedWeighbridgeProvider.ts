import type { WeighbridgeReadResult, WeighbridgeReader } from "./types.js";

export class SimulatedWeighbridgeProvider implements WeighbridgeReader {
  constructor(private readonly fixedKg: number | null = null) {}

  async readWeight(weighbridgeId: string): Promise<WeighbridgeReadResult> {
    const kg = this.fixedKg ?? 8000 + (hashString(weighbridgeId + String(Math.floor(Date.now() / 10_000))) % 28000);
    const asDecimal = kg.toFixed(3);

    return {
      kg,
      asDecimal,
      readAt: new Date().toISOString(),
      source: "SIMULATED",
      provider: "simulated-weighbridge",
      weighbridgeId,
    };
  }
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}
