import type { IScannerProvider, NormalizedScanResult } from "../types.js";

const DEMO_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
  "utf8",
).toString("base64");

export class SimulatorScannerAdapter implements IScannerProvider {
  readonly deviceType = "SCANNER" as const;
  private connected = false;
  private lastCommunicationAt: string | null = null;
  private lastError: string | null = null;

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
      lastScan: this.connected ? "invoice-demo.pdf" : null,
      timestamp: this.lastCommunicationAt,
      lastError: this.lastError,
    };
  }

  async readDocument(): Promise<NormalizedScanResult> {
    if (!this.connected) {
      this.lastError = "Scanner adapter is not connected";
      throw new Error(this.lastError);
    }
    const capturedAt = new Date().toISOString();
    this.lastCommunicationAt = capturedAt;
    return {
      fileName: "invoice-demo.pdf",
      mimeType: "application/pdf",
      contentBase64: DEMO_PDF,
      documentType: "INVOICE",
      capturedAt,
    };
  }
}
