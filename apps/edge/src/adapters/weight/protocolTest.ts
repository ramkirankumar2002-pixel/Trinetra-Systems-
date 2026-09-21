import { parseProtocolTestWeight } from "../../domain/protocolTest.js";
import type { IWeightProvider, NormalizedWeightReading } from "../types.js";

/** PROTOCOL TEST only. Parses recorded messages. Not a manufacturer protocol. */
export class ProtocolTestWeightAdapter implements IWeightProvider {
  readonly deviceType = "WEIGHBRIDGE_INDICATOR" as const;
  private connected = false;
  private lastCommunicationAt: string | null = null;
  private lastError: string | null = null;
  private lastRaw = "";
  private lastParsed: ReturnType<typeof parseProtocolTestWeight> | null = null;

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
      testKind: "PROTOCOL_TEST",
      connectionStatus: this.connected ? "CONNECTED" : "DISCONNECTED",
      raw: this.lastRaw || null,
      parsedWeightKg: this.lastParsed && this.lastParsed.ok ? this.lastParsed.weightKg : null,
      stable: this.lastParsed && this.lastParsed.ok ? this.lastParsed.stable : null,
      timestamp: this.lastCommunicationAt,
      parserStatus: this.lastParsed?.parserStatus ?? "IDLE",
      lastError: this.lastError,
    };
  }

  feedRaw(raw: string, stable?: boolean): ReturnType<typeof parseProtocolTestWeight> {
    this.lastRaw = raw;
    this.lastParsed = parseProtocolTestWeight(raw, stable);
    this.lastCommunicationAt = new Date().toISOString();
    this.lastError = this.lastParsed.ok ? null : this.lastParsed.reason;
    return this.lastParsed;
  }

  async readWeight(): Promise<NormalizedWeightReading> {
    if (!this.connected) {
      this.lastError = "Protocol-test adapter is not connected";
      throw new Error(this.lastError);
    }
    if (!this.lastParsed || !this.lastParsed.ok) {
      this.lastError = this.lastParsed?.ok === false ? this.lastParsed.reason : "No recorded message has been fed";
      return {
        weightKg: 0,
        unit: "KG",
        quality: "NO_DATA",
        connectionStatus: "CONNECTED",
        source: "SIMULATED",
        capturedAt: new Date().toISOString(),
      };
    }
    const capturedAt = new Date().toISOString();
    this.lastCommunicationAt = capturedAt;
    return {
      weightKg: this.lastParsed.weightKg,
      unit: "KG",
      quality: this.lastParsed.stable === false ? "UNSTABLE" : this.lastParsed.stable === true ? "STABLE" : "INVALID",
      connectionStatus: "CONNECTED",
      source: "SIMULATED",
      capturedAt,
    };
  }
}
