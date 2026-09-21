import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { devicesByType, latestCommissioningResult, type PublicCommissioningTest, type PublicPilotDevice } from "./api.ts";

function device(overrides: Partial<PublicPilotDevice> = {}): PublicPilotDevice {
  return {
    id: "dev_1",
    deviceId: "WB-01",
    deviceType: "WEIGHBRIDGE_INDICATOR",
    manufacturer: null,
    model: null,
    serialNumber: null,
    site: { id: "site", code: "DEMO-SITE", name: "Demo Site", operationMode: "SIMULATION" },
    weighbridge: { id: "wb", code: "WB-01", name: "WB-01" },
    connectionType: "SIMULATOR",
    protocol: "SIMULATOR",
    host: null,
    port: null,
    serialPort: null,
    enabled: true,
    adapter: "simulator",
    firmwareVersion: null,
    notes: null,
    installationStatus: "CONFIGURED",
    protocolReadiness: "SIMULATOR",
    status: "CONNECTED",
    lastCommunicationAt: null,
    lastError: null,
    lastWeightKg: 24580,
    lastStability: "STABLE",
    lastPlate: null,
    lastConfidence: null,
    lastScan: null,
    lastFrameAvailable: false,
    diagnostic: { testKind: "SIMULATED", raw: "SIMULATED 24580", parsedWeightKg: 24580 },
    lastClockIssue: null,
    gateway: {
      id: "gw",
      code: "TRINETRA-EDGE-01",
      name: "Demo",
      status: "ONLINE",
      softwareVersion: "0.15.0",
      lastHeartbeatAt: null,
    },
    ...overrides,
  };
}

describe("hardware pilot labels", () => {
  it("groups inventory devices and summarizes commissioning without secrets", () => {
    const devices = [device(), device({ id: "cam", deviceId: "CAM-01", deviceType: "CAMERA" })];
    assert.equal(devicesByType(devices, "WEIGHBRIDGE_INDICATOR").length, 1);
    const tests: PublicCommissioningTest[] = [
      {
        id: "1",
        deviceId: "dev_1",
        testKey: "wb_powered",
        testType: "WEIGHBRIDGE",
        label: "Indicator powered",
        result: "PASS",
        notes: null,
        error: null,
        testedAt: null,
        testedBy: null,
      },
      {
        id: "2",
        deviceId: "dev_1",
        testKey: "wb_protocol",
        testType: "WEIGHBRIDGE",
        label: "Correct protocol confirmed",
        result: "NOT_TESTED",
        notes: null,
        error: null,
        testedAt: null,
        testedBy: null,
      },
    ];
    assert.equal(latestCommissioningResult(tests, "WEIGHBRIDGE"), "NOT_TESTED");
    assert.equal(JSON.stringify(device().diagnostic)?.includes("password"), false);
  });
});
