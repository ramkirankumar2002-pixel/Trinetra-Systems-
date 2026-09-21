import type { IWeightProvider, NormalizedWeightReading } from "../types.js";

export class SimulatorWeightAdapter implements IWeightProvider {
  readonly deviceType = "WEIGHBRIDGE_INDICATOR" as const;
  private connected = false;
  private lastCommunicationAt: string | null = null;
  private lastError: string | null = null;
  private script: Array<{ weightKg: number | null; quality?: NormalizedWeightReading["quality"] }> | null = null;
  private scriptIndex = 0;

  constructor(private readonly baseKg = 24580) {}

  setAnomalyScript(script: Array<{ weightKg: number | null; quality?: NormalizedWeightReading["quality"] }> | null): void {
    this.script = script;
    this.scriptIndex = 0;
  }

  async connect(): Promise<void> {
    this.connected = true;
    this.lastCommunicationAt = new Date().toISOString();
    this.lastError = null;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  health() {
    return {
      status: this.connected ? ("CONNECTED" as const) : ("DISCONNECTED" as const),
      lastCommunicationAt: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  diagnostic() {
    return {
      testKind: "SIMULATED",
      connectionStatus: this.connected ? "CONNECTED" : "DISCONNECTED",
      raw: `SIMULATED ${this.baseKg}`,
      parsedWeightKg: this.baseKg,
      stable: true,
      timestamp: this.lastCommunicationAt,
      parserStatus: this.connected ? "PARSED" : "DISCONNECTED",
      lastError: this.lastError,
    };
  }

  async readWeight(): Promise<NormalizedWeightReading> {
    if (!this.connected) {
      this.lastError = "Weight adapter is not connected";
      throw new Error(this.lastError);
    }
    const capturedAt = new Date().toISOString();
    this.lastCommunicationAt = capturedAt;
    if (this.script && this.script.length > 0) {
      const item = this.script[Math.min(this.scriptIndex, this.script.length - 1)];
      this.scriptIndex += 1;
      return {
        weightKg: item?.weightKg ?? 0,
        unit: "KG",
        quality: item?.quality ?? "STABLE",
        connectionStatus: "CONNECTED",
        source: "SIMULATED",
        capturedAt,
      };
    }
    return {
      weightKg: this.baseKg,
      unit: "KG",
      quality: "STABLE",
      connectionStatus: "CONNECTED",
      source: "SIMULATED",
      capturedAt,
    };
  }
}
