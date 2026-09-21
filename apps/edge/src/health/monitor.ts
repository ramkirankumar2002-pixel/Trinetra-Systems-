import { platform } from "node:os";
import { edgeEnv } from "../config/env.js";
import type { ConnectivityManager } from "../connectivity/manager.js";
import type { EdgeLogger } from "../core/logger.js";
import type { DeviceRegistry } from "../devices/registry.js";
import { BackendUnavailableError, GatewayAuthError, type GatewayClient } from "../gateway/client.js";
import type { OfflineOperator } from "../offline/operator.js";
import { isConfigStale } from "../offline/policy.js";
import type { FileEventQueue } from "../queue/fileQueue.js";
import type { SyncLoop } from "../sync/syncLoop.js";

export class HealthMonitor {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly client: GatewayClient,
    private readonly devices: DeviceRegistry,
    private readonly sync: SyncLoop,
    private readonly logger: EdgeLogger,
    private readonly queue: FileEventQueue,
    private readonly connectivity: ConnectivityManager,
    private readonly operator?: OfflineOperator,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.beat();
    }, edgeEnv.heartbeatIntervalMs);
    void this.beat();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async beat(): Promise<void> {
    const devices = this.devices.healthSummary();
    const connectedDeviceCount = devices.filter((device) => device.status === "CONNECTED").length;
    const hardwareOnline = connectedDeviceCount > 0;
    await this.queue.store.setState({
      hardwareStatus: hardwareOnline ? "ONLINE" : "OFFLINE",
      storageLimitBytes: edgeEnv.storageLimitBytes,
    });
    const config = await this.queue.store.getConfig();
    const stale = isConfigStale(config, Date.now());
    await this.queue.store.setState({ configStale: stale });
    const storage = await this.queue.store.measureStorage();
    if (storage.approachingLimit) {
      await this.logger.warn("storage_limit_approaching", { usedBytes: storage.usedBytes });
    }

    if (this.connectivity.isSimulatedOffline() || !this.sync.isBackendOnline()) {
      await this.connectivity.observe({
        internetOnline: false,
        backendReachable: false,
        hardwareOnline,
        authFailed: false,
        syncing: false,
        pendingCritical: 1,
        openConflicts: (await this.queue.store.listConflicts()).length,
      });
      return;
    }

    try {
      const state = await this.queue.store.getState();
      const stats = await this.queue.stats();
      await this.client.heartbeat({
        softwareVersion: edgeEnv.softwareVersion,
        buildEnvironment: edgeEnv.buildEnvironment,
        platform: `${platform()} ${process.arch}`,
        status: state.connectivityState === "ONLINE" ? "ONLINE" : state.connectivityState === "OFFLINE" ? "OFFLINE" : "DEGRADED",
        connectedDeviceCount,
        snapshot: {
          ...state,
          queued: stats.pending,
          syncing: stats.syncing,
          synced: stats.synced,
          failed: stats.failed,
          deadLetter: stats.deadLetter,
          configVersion: config?.version ?? null,
          configCachedAt: config?.timestamp ?? null,
          configStale: stale,
          lastLocalAlert: this.operator?.lastLocalAlert ?? null,
        },
        devices: devices.map((device) => ({
          deviceId: device.deviceId,
          status: device.status,
          lastCommunicationAt: device.lastCommunicationAt,
          lastError: device.lastError,
          ...(device.lastDiagnostic ? { lastDiagnostic: device.lastDiagnostic } : {}),
        })),
      });
      await this.connectivity.observe({
        internetOnline: true,
        backendReachable: true,
        hardwareOnline,
        authFailed: false,
        syncing: false,
        pendingCritical: stats.pending,
        openConflicts: (await this.queue.store.listConflicts()).length,
      });
      await this.logger.info("heartbeat_sent", { connectedDeviceCount });
    } catch (error) {
      if (error instanceof GatewayAuthError) {
        await this.connectivity.observe({
          internetOnline: true,
          backendReachable: false,
          hardwareOnline,
          authFailed: true,
          syncing: false,
          pendingCritical: 1,
          openConflicts: 0,
        });
        await this.logger.error("heartbeat_failed", { error: error.message });
        return;
      }
      if (error instanceof BackendUnavailableError) {
        await this.connectivity.observe({
          internetOnline: false,
          backendReachable: false,
          hardwareOnline,
          authFailed: false,
          syncing: false,
          pendingCritical: 1,
          openConflicts: (await this.queue.store.listConflicts()).length,
        });
        await this.logger.warn("backend_unavailable", { reason: "heartbeat" });
        return;
      }
      await this.logger.error("heartbeat_failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
