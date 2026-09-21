import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SimulatorCameraAdapter } from "../adapters/camera/simulator.js";
import { SimulatorScannerAdapter } from "../adapters/scanner/simulator.js";
import { ProtocolTestWeightAdapter } from "../adapters/weight/protocolTest.js";
import { SimulatorWeightAdapter } from "../adapters/weight/simulator.js";
import { edgeEnv } from "../config/env.js";
import type { EdgeLogger } from "../core/logger.js";
import type { DeviceRegistry } from "../devices/registry.js";
import { anprEventFromAdapter, scanEventFromAdapter, weightEventFromAdapter } from "../events/factory.js";
import type { OfflineOperator } from "../offline/operator.js";
import { operatorHtml } from "../operator/page.js";
import type { FileEventQueue } from "../queue/fileQueue.js";
import type { SyncLoop } from "../sync/syncLoop.js";

export function startControlServer(input: {
  gatewayId: string;
  devices: DeviceRegistry;
  queue: FileEventQueue;
  sync: SyncLoop;
  logger: EdgeLogger;
  operator: OfflineOperator;
}): { close: () => Promise<void> } {
  const server = createServer((request, response) => {
    void handle(request, response, input);
  });

  server.listen(edgeEnv.controlPort, "127.0.0.1", () => {
    void input.logger.info("control_listening", { port: edgeEnv.controlPort, bind: "127.0.0.1" });
  });

  return {
    close: async () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  input: {
    gatewayId: string;
    devices: DeviceRegistry;
    queue: FileEventQueue;
    sync: SyncLoop;
    logger: EdgeLogger;
    operator: OfflineOperator;
  },
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  try {
    if (request.method === "GET" && (url.pathname === "/operator" || url.pathname === "/")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(operatorHtml());
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        status: "ok",
        service: "trinetra-edge",
        simulator: edgeEnv.simulator,
        backendOnline: input.sync.isBackendOnline(),
        ...(await input.operator.status()),
        devices: input.devices.healthSummary(),
        version: edgeEnv.softwareVersion,
        platform: process.platform,
      });
      return;
    }
    if (request.method === "GET" && (url.pathname === "/queue" || url.pathname === "/sync/status" || url.pathname === "/operator/status")) {
      writeJson(response, 200, await input.operator.status());
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/transaction") {
      const body = await readJson(request);
      const transaction = await input.operator.createTransaction({
        ...(typeof body.vehicleNumber === "string" ? { vehicleNumber: body.vehicleNumber } : {}),
        approvalRequired: body.approvalRequired === true,
      });
      writeJson(response, 201, { transaction });
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/gross") {
      const body = await readJson(request);
      writeJson(response, 201, { transaction: await input.operator.captureGross(requiredId(body.localTransactionId)) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/tare") {
      const body = await readJson(request);
      writeJson(response, 201, { transaction: await input.operator.captureTare(requiredId(body.localTransactionId)) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/complete") {
      const body = await readJson(request);
      writeJson(response, 201, { transaction: await input.operator.complete(requiredId(body.localTransactionId)) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/anpr") {
      const body = await readJson(request);
      writeJson(response, 201, await input.operator.captureAnpr(typeof body.localTransactionId === "string" ? body.localTransactionId : undefined));
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/scan") {
      const body = await readJson(request);
      writeJson(response, 201, await input.operator.captureScan(typeof body.localTransactionId === "string" ? body.localTransactionId : undefined));
      return;
    }
    if (request.method === "POST" && url.pathname === "/operator/anomaly") {
      const body = await readJson(request);
      writeJson(
        response,
        201,
        await input.operator.detectLocalAnomaly({
          weightKg: typeof body.weightKg === "number" ? body.weightKg : 850,
          platformState: body.platformState === "VEHICLE_PRESENT" ? "VEHICLE_PRESENT" : "EMPTY",
          ...(typeof body.localTransactionId === "string" ? { localTransactionId: body.localTransactionId } : {}),
        }),
      );
      return;
    }
    if (request.method === "POST" && url.pathname === "/simulate/weight") {
      writeJson(response, 201, await enqueueWeight(input, await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/simulate/anpr") {
      writeJson(response, 201, await enqueueAnpr(input));
      return;
    }
    if (request.method === "POST" && url.pathname === "/simulate/scan") {
      writeJson(response, 201, await enqueueScan(input, await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/simulate/disconnect-backend") {
      input.sync.setPaused(true);
      await input.logger.warn("backend_unavailable", { simulated: true });
      writeJson(response, 200, { backendOnline: false, connectivity: (await input.operator.status()).connectivity });
      return;
    }
    if (request.method === "POST" && url.pathname === "/simulate/reconnect-backend") {
      input.sync.setPaused(false);
      await input.logger.info("backend_connection_restored", { simulated: true });
      void input.sync.tick();
      writeJson(response, 200, { backendOnline: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/diagnostics") {
      writeJson(response, 200, {
        testKind: edgeEnv.simulator ? "SIMULATED" : "PROTOCOL_TEST",
        devices: input.devices.healthSummary(),
      });
      return;
    }
    if (request.method === "POST" && url.pathname === "/diagnostics/feed") {
      writeJson(response, 200, feedProtocolTest(input, await readJson(request)));
      return;
    }
    writeJson(response, 404, { error: "Not found" });
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
  }
}

async function enqueueWeight(
  input: { gatewayId: string; devices: DeviceRegistry; queue: FileEventQueue; logger: EdgeLogger },
  body: Record<string, unknown>,
) {
  const device = input.devices.findByCode("WB-01") ?? input.devices.list().find((item) => item.deviceType === "WEIGHBRIDGE_INDICATOR");
  if (
    !device ||
    (!(device.adapter instanceof SimulatorWeightAdapter) && !(device.adapter instanceof ProtocolTestWeightAdapter))
  ) {
    throw new Error("Weight simulator is not bound");
  }
  const extras: Record<string, unknown> = {};
  if (typeof body.transactionId === "string") {
    extras.transactionId = body.transactionId;
    extras.captureOfficial = body.captureOfficial === true;
  }
  if (typeof body.localTransactionId === "string") {
    extras.localTransactionId = body.localTransactionId;
    extras.captureOfficial = body.captureOfficial === true;
  }
  const envelope = await weightEventFromAdapter(input.gatewayId, device, device.adapter, extras);
  const queued = await input.queue.enqueue(envelope, {
    localTransactionId: typeof body.localTransactionId === "string" ? body.localTransactionId : null,
  });
  await input.logger.info("event_queued", { eventId: queued.eventId, eventType: queued.eventType });
  return { event: queued };
}

async function enqueueAnpr(input: {
  gatewayId: string;
  devices: DeviceRegistry;
  queue: FileEventQueue;
  logger: EdgeLogger;
}) {
  const device = input.devices.findByCode("CAM-01") ?? input.devices.list().find((item) => item.deviceType === "CAMERA");
  if (!device || !(device.adapter instanceof SimulatorCameraAdapter)) {
    throw new Error("Camera simulator is not bound");
  }
  const envelope = await anprEventFromAdapter(input.gatewayId, device, device.adapter);
  const queued = await input.queue.enqueue(envelope);
  await input.logger.info("event_queued", { eventId: queued.eventId, eventType: queued.eventType });
  return { event: queued };
}

async function enqueueScan(
  input: { gatewayId: string; devices: DeviceRegistry; queue: FileEventQueue; logger: EdgeLogger },
  body: Record<string, unknown>,
) {
  const device = input.devices.findByCode("SCAN-01") ?? input.devices.list().find((item) => item.deviceType === "SCANNER");
  if (!device || !(device.adapter instanceof SimulatorScannerAdapter)) {
    throw new Error("Scanner simulator is not bound");
  }
  const extras: Record<string, unknown> = {};
  if (typeof body.transactionId === "string") {
    extras.transactionId = body.transactionId;
  }
  const envelope = await scanEventFromAdapter(input.gatewayId, device, device.adapter, extras);
  const queued = await input.queue.enqueue(envelope);
  await input.logger.info("event_queued", { eventId: queued.eventId, eventType: queued.eventType });
  return { event: queued };
}

function feedProtocolTest(input: { devices: DeviceRegistry }, body: Record<string, unknown>) {
  const device =
    input.devices.findByCode(typeof body.deviceCode === "string" ? body.deviceCode : "WB-01") ??
    input.devices.list().find((item) => item.adapter instanceof ProtocolTestWeightAdapter);
  if (!device || !(device.adapter instanceof ProtocolTestWeightAdapter)) {
    throw new Error("Protocol-test weight adapter is not bound");
  }
  const raw = typeof body.raw === "string" ? body.raw : "";
  const parsed = device.adapter.feedRaw(raw, typeof body.stable === "boolean" ? body.stable : undefined);
  return { testKind: "PROTOCOL_TEST", device: device.code, parsed, diagnostic: device.adapter.diagnostic() };
}

function requiredId(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("localTransactionId is required");
  }
  return value;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
}
