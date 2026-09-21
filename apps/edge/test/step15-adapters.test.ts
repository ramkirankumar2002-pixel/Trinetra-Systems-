import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProtocolTestWeightAdapter } from "../src/adapters/weight/protocolTest.js";
import { SimulatorWeightAdapter } from "../src/adapters/weight/simulator.js";
import { UndeployedWeightAdapter } from "../src/adapters/weight/undeployed.js";
import { SerialWeightAdapter } from "../src/adapters/weight/serial.js";
import { DeviceRegistry, resolveEdgeAdapterKey } from "../src/devices/registry.js";
import { parseProtocolTestWeight } from "../src/domain/protocolTest.js";
import { serialPortAvailability } from "../src/domain/serialAvailability.js";

describe("edge hardware pilot adapters", () => {
  it("keeps the simulator as the SIMULATED TEST path", async () => {
    const adapter = new SimulatorWeightAdapter();
    await adapter.connect();
    const reading = await adapter.readWeight();
    assert.equal(reading.source, "SIMULATED");
    assert.equal(adapter.diagnostic().testKind, "SIMULATED");
    await adapter.disconnect();
  });

  it("can script empty-platform and invalid readings for backend anomaly demos", async () => {
    const adapter = new SimulatorWeightAdapter();
    await adapter.connect();
    adapter.setAnomalyScript([
      { weightKg: 3, quality: "STABLE" },
      { weightKg: 850, quality: "STABLE" },
      { weightKg: null, quality: "INVALID" },
    ]);
    const first = await adapter.readWeight();
    const second = await adapter.readWeight();
    const third = await adapter.readWeight();
    assert.equal(first.weightKg, 3);
    assert.equal(second.weightKg, 850);
    assert.equal(third.quality, "INVALID");
    await adapter.disconnect();
  });

  it("parses recorded messages as PROTOCOL TEST only", async () => {
    const parsed = parseProtocolTestWeight("WT 24580 KG", true);
    assert.equal(parsed.ok, true);
    const adapter = new ProtocolTestWeightAdapter();
    await adapter.connect();
    adapter.feedRaw("WT 24580 KG", true);
    const reading = await adapter.readWeight();
    assert.equal(reading.source, "SIMULATED");
    assert.equal(reading.quality, "STABLE");
    assert.equal(adapter.diagnostic().testKind, "PROTOCOL_TEST");
    await adapter.disconnect();
  });

  it("reports DEVICE NOT AVAILABLE instead of crashing when a serial port is missing", async () => {
    assert.equal(serialPortAvailability("COM9999").reason, "DEVICE NOT AVAILABLE");
    const serial = new SerialWeightAdapter("COM9999");
    await serial.connect();
    assert.equal(serial.health().lastError, "DEVICE NOT AVAILABLE");
    const undeployed = new UndeployedWeightAdapter({
      id: "dev",
      code: "WB-99",
      name: "Unknown indicator",
      deviceType: "WEIGHBRIDGE_INDICATOR",
      enabled: true,
      status: "DISCONNECTED",
      protocolReadiness: "PROTOCOL_DETAILS_REQUIRED",
      serialPort: "COM9999",
    });
    await undeployed.connect();
    assert.equal(undeployed.health().status, "ERROR");
    assert.equal(undeployed.health().lastError, "DEVICE NOT AVAILABLE");
  });

  it("binds simulator, protocol-test, and undeployed adapters from registry metadata", () => {
    assert.equal(resolveEdgeAdapterKey({ id: "1", code: "A", name: "A", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "CONNECTED", protocolReadiness: "SIMULATOR" }), "simulator");
    assert.equal(resolveEdgeAdapterKey({ id: "2", code: "B", name: "B", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "DISCONNECTED", protocolReadiness: "PROTOCOL_TEST_ONLY" }), "protocol-test");
    assert.equal(resolveEdgeAdapterKey({ id: "3", code: "C", name: "C", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "DISCONNECTED", protocolReadiness: "PROTOCOL_DETAILS_REQUIRED", provider: "SERIAL" }), "undeployed");

    const registry = new DeviceRegistry();
    registry.bind([
      { id: "sim", code: "WB-01", name: "WB-01", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "CONNECTED", protocolReadiness: "SIMULATOR" },
      { id: "test", code: "WB-PT", name: "WB-PT", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "DISCONNECTED", protocolReadiness: "PROTOCOL_TEST_ONLY" },
      { id: "real", code: "WB-XX", name: "WB-XX", deviceType: "WEIGHBRIDGE_INDICATOR", enabled: true, status: "DISCONNECTED", protocolReadiness: "PROTOCOL_DETAILS_REQUIRED", provider: "SERIAL" },
    ]);
    assert.ok(registry.findByCode("WB-01")?.adapter instanceof SimulatorWeightAdapter);
    assert.ok(registry.findByCode("WB-PT")?.adapter instanceof ProtocolTestWeightAdapter);
    assert.ok(registry.findByCode("WB-XX")?.adapter instanceof UndeployedWeightAdapter);
  });
});
