import type { IScannerProvider, NormalizedScanResult } from "../types.js";

export class UndeployedScannerAdapter implements IScannerProvider {
  readonly deviceType = "SCANNER" as const;
  private lastError = "PROTOCOL DETAILS REQUIRED";
  private lastCommunicationAt: string | null = null;

  async connect(): Promise<void> {
    this.lastCommunicationAt = new Date().toISOString();
  }

  async disconnect(): Promise<void> {}

  health() {
    return {
      status: "ERROR" as const,
      lastCommunicationAt: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  diagnostic() {
    return {
      testKind: "UNAVAILABLE",
      connectionStatus: "ERROR",
      lastScan: null,
      lastError: this.lastError,
    };
  }

  async readDocument(): Promise<NormalizedScanResult> {
    throw new Error(this.lastError);
  }
}
