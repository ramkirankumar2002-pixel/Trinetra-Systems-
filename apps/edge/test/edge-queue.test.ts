import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { SimulatorCameraAdapter } from "../src/adapters/camera/simulator.js";
import { SimulatorScannerAdapter } from "../src/adapters/scanner/simulator.js";
import { SimulatorWeightAdapter } from "../src/adapters/weight/simulator.js";
import { nextRetryDelayMs, shouldRetry } from "../src/core/backoff.js";
import { createEnvelope } from "../src/events/envelope.js";
import { FileEventQueue } from "../src/queue/fileQueue.js";

describe("edge local queue", () => {
  it("keeps a unique event id across retries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-edge-"));
    const queue = new FileEventQueue(path.join(dir, "queue.json"));
    const envelope = createEnvelope({
      eventId: "EVENT-ABC-0001",
      gatewayId: "gw_1",
      deviceId: "dev_1",
      deviceType: "WEIGHBRIDGE_INDICATOR",
      eventType: "DEVICE_WEIGHT_READING",
      deviceEventTime: "2026-09-20T10:00:00.000Z",
      gatewayReceiveTime: "2026-09-20T10:00:00.100Z",
      softwareVersion: "0.14.0",
      payload: { weightKg: 24580, quality: "STABLE" },
    });
    const first = await queue.enqueue(envelope);
    const second = await queue.enqueue(envelope);
    assert.equal(first.eventId, second.eventId);
    assert.equal(first.status, "PENDING");
    await queue.update(first.eventId, { status: "SYNCING" });
    await queue.update(first.eventId, { status: "SYNCED", syncedAt: new Date().toISOString() });
    const stored = await queue.get(first.eventId);
    assert.equal(stored?.status, "SYNCED");
    assert.equal((await queue.stats()).synced, 1);
    await rm(dir, { recursive: true, force: true });
  });

  it("uses the same simulator adapters as the live event pipeline", async () => {
    const weight = new SimulatorWeightAdapter(24580);
    const camera = new SimulatorCameraAdapter("APXX1234");
    const scanner = new SimulatorScannerAdapter();
    await weight.connect();
    await camera.connect();
    await scanner.connect();
    const reading = await weight.readWeight();
    const plate = await camera.readPlate();
    const scan = await scanner.readDocument();
    assert.equal(reading.quality, "STABLE");
    assert.equal(reading.weightKg, 24580);
    assert.equal(plate.normalizedPlateNumber, "APXX1234");
    assert.equal(plate.confidence, 0.96);
    assert.equal(scan.fileName, "invoice-demo.pdf");
    assert.equal(shouldRetry(2, 8), true);
    assert.ok(nextRetryDelayMs(2) > nextRetryDelayMs(0));
  });
});
