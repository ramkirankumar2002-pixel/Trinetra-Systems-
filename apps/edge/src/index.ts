import path from "node:path";
import { assertEdgeConfig, edgeEnv } from "./config/env.js";
import { ConnectivityManager } from "./connectivity/manager.js";
import { EdgeLogger } from "./core/logger.js";
import { DeviceRegistry } from "./devices/registry.js";
import { createGatewayClient } from "./gateway/client.js";
import { HealthMonitor } from "./health/monitor.js";
import { OfflineOperator } from "./offline/operator.js";
import { FileEventQueue } from "./queue/fileQueue.js";
import { startControlServer } from "./simulator/controlServer.js";
import { LocalStore } from "./store/localStore.js";
import { SyncLoop } from "./sync/syncLoop.js";

async function main(): Promise<void> {
  assertEdgeConfig();
  const logger = new EdgeLogger(path.join(edgeEnv.dataDir, "logs"));
  await logger.info("gateway_startup", {
    code: edgeEnv.gatewayCode,
    backendUrl: edgeEnv.backendUrl,
    simulator: edgeEnv.simulator,
    version: edgeEnv.softwareVersion,
    platform: process.platform,
  });

  const store = new LocalStore(path.join(edgeEnv.dataDir, "store.json"));
  const queue = new FileEventQueue(store);
  const client = createGatewayClient();
  const devices = new DeviceRegistry();
  const connectivity = new ConnectivityManager(store, logger, edgeEnv.failThreshold, edgeEnv.recoverThreshold);

  let gatewayId = edgeEnv.gatewayId;
  try {
    const bootstrap = await client.bootstrap();
    if (!bootstrap.config) {
      throw new Error("Bootstrap did not include a configuration cache");
    }
    gatewayId = bootstrap.gateway.id;
    devices.bind(bootstrap.devices);
    await store.setConfig(bootstrap.config);
    await store.audit("EDGE_CONFIG_CACHE_UPDATED", "ConfigCache", bootstrap.config.version, {
      source: bootstrap.config.source,
    });
    await connectivity.observe({
      internetOnline: true,
      backendReachable: true,
      hardwareOnline: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 0,
      openConflicts: 0,
    });
  } catch (error) {
    const cached = await store.getConfig();
    if (!cached) {
      throw new Error(
        `Backend is unavailable and no configuration cache exists: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    gatewayId = cached.gateway.id;
    devices.bind(cached.devices);
    await connectivity.observe({
      internetOnline: false,
      backendReachable: false,
      hardwareOnline: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 1,
      openConflicts: 0,
    });
    await logger.warn("started_from_config_cache", { version: cached.version });
  }

  for (const device of devices.list()) {
    if (!device.enabled) {
      continue;
    }
    try {
      await device.adapter.connect();
      await logger.info("device_connected", { code: device.code, deviceType: device.deviceType });
    } catch (error) {
      await logger.warn("device_unavailable", {
        code: device.code,
        error: error instanceof Error ? error.message : "DEVICE NOT AVAILABLE",
      });
    }
  }

  const operator = new OfflineOperator(gatewayId, devices, queue, logger);
  const sync = new SyncLoop(queue, client, logger);
  sync.attachConnectivity(connectivity);
  const health = new HealthMonitor(client, devices, sync, logger, queue, connectivity, operator);
  sync.start();
  health.start();

  if (edgeEnv.simulator) {
    startControlServer({
      gatewayId,
      devices,
      queue,
      sync,
      logger,
      operator,
    });
  }

  const shutdown = async (): Promise<void> => {
    health.stop();
    sync.stop();
    for (const device of devices.list()) {
      await device.adapter.disconnect();
      await logger.info("device_disconnected", { code: device.code });
    }
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
