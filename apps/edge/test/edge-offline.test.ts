import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { nextRetryDelayMs, shouldRetry } from "../src/core/backoff.js";
import { createEnvelope } from "../src/events/envelope.js";
import { LocalAnomalyDetector } from "../src/offline/anomaly.js";
import { calculateNetWeight, kgNumberToDecimal } from "../src/offline/netWeight.js";
import { evaluateLocalAction } from "../src/offline/policy.js";
import { compareQueuedEvents } from "../src/offline/priority.js";
import { FileEventQueue } from "../src/queue/fileQueue.js";
import { LocalStore } from "../src/store/localStore.js";
import { recoverTempFile } from "../src/store/atomicWrite.js";
import { readFile } from "node:fs/promises";
import type { ConfigCache } from "../src/store/types.js";
import { edgeCredentialIssue } from "../src/config/env.js";

function envelope(eventId: string, eventType: "DEVICE_WEIGHT_READING" | "DEVICE_ANPR_DETECTION" | "DEVICE_STATUS_CHANGED" = "DEVICE_WEIGHT_READING") {
  return createEnvelope({
    eventId,
    gatewayId: "gw_1",
    deviceId: "dev_1",
    deviceType: eventType === "DEVICE_ANPR_DETECTION" ? "CAMERA" : "WEIGHBRIDGE_INDICATOR",
    eventType,
    deviceEventTime: "2026-09-20T10:00:00.000Z",
    gatewayReceiveTime: "2026-09-20T10:00:00.100Z",
    softwareVersion: "0.17.0",
    payload: { weightKg: 24580, quality: "STABLE", localTransactionId: "EDGE01-20260920-000001" },
  });
}

describe("edge offline persistence", () => {
  it("acknowledges storage only after the event is on disk", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const file = path.join(dir, "store.json");
    const store = new LocalStore(file);
    const queued = await store.enqueue(envelope("EVENT-ACK-0001"));
    const raw = await readFile(file, "utf8");
    assert.equal(queued.status, "PENDING");
    assert.equal(raw.includes("EVENT-ACK-0001"), true);
    await rm(dir, { recursive: true, force: true });
  });

  it("restores a backup store file after an interrupted replace", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const file = path.join(dir, "store.json");
    await writeFile(`${file}.bak`, `${JSON.stringify({ events: [{ eventId: "EVENT-BAK-0001" }] })}\n`);
    await recoverTempFile(file);
    const raw = await readFile(file, "utf8");
    assert.equal(raw.includes("EVENT-BAK-0001"), true);
    await rm(dir, { recursive: true, force: true });
  });

  it("survives a process restart without losing queued events or retry counters", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const file = path.join(dir, "store.json");
    const first = new FileEventQueue(file);
    const queued = await first.enqueue(envelope("EVENT-RST-0001"));
    await first.update(queued.eventId, { retryCount: 2, status: "FAILED", lastAttemptAt: "2026-09-20T10:01:00.000Z" });
    const reopened = new FileEventQueue(file);
    const stored = await reopened.get("EVENT-RST-0001");
    assert.equal(stored?.status, "FAILED");
    assert.equal(stored?.retryCount, 2);
    assert.equal(stored?.eventId, "EVENT-RST-0001");
    await rm(dir, { recursive: true, force: true });
  });

  it("does not create a second row when the same eventId is enqueued twice", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const queue = new FileEventQueue(path.join(dir, "store.json"));
    const first = await queue.enqueue(envelope("EVENT-DUP-0001"));
    const second = await queue.enqueue(envelope("EVENT-DUP-0001"));
    assert.equal(first.eventId, second.eventId);
    assert.equal((await queue.stats()).pending, 1);
    await rm(dir, { recursive: true, force: true });
  });

  it("moves exhausted retries to dead letter instead of deleting them", async () => {
    assert.equal(shouldRetry(8, 8), false);
    assert.ok(nextRetryDelayMs(3) > nextRetryDelayMs(0));
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const queue = new FileEventQueue(path.join(dir, "store.json"));
    const queued = await queue.enqueue(envelope("EVENT-DLQ-0001"));
    await queue.update(queued.eventId, {
      status: "DEAD_LETTER",
      retryCount: 8,
      failureReason: "permanent schema error",
      recommendedAction: "Inspect the dead-letter record. The business event was not deleted.",
    });
    const stored = await queue.get("EVENT-DLQ-0001");
    assert.equal(stored?.status, "DEAD_LETTER");
    assert.equal((await queue.stats()).deadLetter, 1);
    await rm(dir, { recursive: true, force: true });
  });

  it("orders recovery by priority then event time", () => {
    const ordered = [
      { priority: "LOW" as const, eventTimestamp: "2026-09-20T10:00:00.000Z", receivedAt: "2026-09-20T10:00:00.000Z" },
      { priority: "CRITICAL" as const, eventTimestamp: "2026-09-20T10:00:10.000Z", receivedAt: "2026-09-20T10:00:10.000Z" },
    ].sort(compareQueuedEvents);
    assert.equal(ordered[0]?.priority, "CRITICAL");
  });

  it("allocates monotonic local transaction ids per gateway day", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const store = new LocalStore(path.join(dir, "store.json"));
    const now = Date.parse("2026-09-20T08:00:00.000Z");
    const first = await store.nextLocalTransactionId("TRINETRA-EDGE-01", now);
    const second = await store.nextLocalTransactionId("TRINETRA-EDGE-01", now);
    assert.equal(first, "TRINETRAEDGE01-20260920-000001");
    assert.equal(second, "TRINETRAEDGE01-20260920-000002");
    await rm(dir, { recursive: true, force: true });
  });

  it("calculates net weight with three decimal places and rejects tare over gross", () => {
    assert.equal(kgNumberToDecimal(24580.25), "24580.250");
    const net = calculateNetWeight("24580.250", "8420.125");
    assert.equal(net.netAsDecimal, "16160.125");
    assert.equal(calculateNetWeight("1000.000", "1100.000").tareExceedsGross, true);
  });

  it("detects an empty-platform weight locally using cached thresholds", () => {
    const detector = new LocalAnomalyDetector();
    const hit = detector.evaluate(
      { timestampMs: 1_000, weightKg: 850, quality: "STABLE" },
      {
        emptyPlatformThresholdKg: 50,
        maxChangePerSecondKg: 2000,
        weightJumpThresholdKg: 3000,
        maxInstabilityDurationMs: 8000,
        consecutiveAnomalyCount: 2,
      },
      "EMPTY",
    );
    assert.equal(hit?.type, "EMPTY_PLATFORM_WEIGHT");
  });

  it("hashes local files so the same bytes upload once", async () => {
    const bytes = Buffer.from("invoice");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const dir = await mkdtemp(path.join(tmpdir(), "trinetra-offline-"));
    const store = new LocalStore(path.join(dir, "store.json"));
    const filePath = path.join(dir, "doc.bin");
    await writeFile(filePath, bytes);
    const first = await store.addFile({
      fileId: "file-1",
      eventId: "EVENT-FILE-1",
      localPath: filePath,
      contentHash: hash,
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      createdAt: new Date().toISOString(),
      syncStatus: "PENDING",
    });
    const second = await store.addFile({
      fileId: "file-2",
      eventId: "EVENT-FILE-2",
      localPath: filePath,
      contentHash: hash,
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
      createdAt: new Date().toISOString(),
      syncStatus: "PENDING",
    });
    assert.equal(first.fileId, second.fileId);
    await rm(dir, { recursive: true, force: true });
  });

  it("refuses offline approval even when a configuration cache is present", () => {
    const cache = {
      policy: {
        approvals: "BLOCKED",
        transactionCompletion: "CONDITIONAL",
        allowWeightRead: true,
        allowAnpr: true,
        allowDocumentCapture: true,
        allowBasicTransactionRecording: true,
        allowWeightAnomalyDetection: true,
        materialVerification: "CONDITIONAL",
        configChanges: "BLOCKED",
        userManagement: "BLOCKED",
        hardwareConfigChanges: "BLOCKED",
        maxConfigAgeHours: 24,
        version: 1,
        source: "CENTRAL",
        timestamp: "2026-09-20T10:00:00.000Z",
        validUntil: "2026-09-21T10:00:00.000Z",
      },
      validUntil: "2026-09-21T10:00:00.000Z",
    } as ConfigCache;
    assert.equal(evaluateLocalAction(cache, "APPROVAL", { nowMs: Date.parse("2026-09-20T12:00:00.000Z") }).allowed, false);
    assert.equal(
      evaluateLocalAction(cache, "TRANSACTION_COMPLETION", {
        nowMs: Date.parse("2026-09-20T12:00:00.000Z"),
        approvalRequired: true,
      }).allowed,
      false,
    );
  });
});

describe("edge production credentials", () => {
  it("rejects the development-only token in production", () => {
    assert.equal(
      edgeCredentialIssue("tgw_devonly_trinetra_edge_simulator_not_for_production_0001", "production"),
      "Development Edge Gateway credential cannot be used in production",
    );
    assert.equal(edgeCredentialIssue("tgw_site_unique_token_example", "production"), null);
    assert.equal(edgeCredentialIssue("", "development"), "EDGE_GATEWAY_TOKEN is required");
  });
});
