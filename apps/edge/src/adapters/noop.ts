import type { EdgeDeviceType } from "../events/envelope.js";
import type { IDeviceAdapter } from "./types.js";

export class NoopAdapter implements IDeviceAdapter {
  constructor(readonly deviceType: EdgeDeviceType) {}

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  health() {
    return {
      status: "CONNECTED" as const,
      lastCommunicationAt: new Date().toISOString(),
      lastError: null,
    };
  }
}
