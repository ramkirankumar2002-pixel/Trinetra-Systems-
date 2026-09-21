import { deriveDeviceHealth, type DeviceHealthSnapshot, type HardwareDeviceStatus } from "../../domain/hardwareStatus.js";
import type { NormalizedWeightReading } from "../../domain/normalizedWeight.js";
import { createWeightProvider } from "./factory.js";
import type { IWeightProvider, ProviderFactoryInput } from "./provider.js";

export type ManagedDeviceSnapshot = {
  weighbridgeId: string;
  profileId: string;
  organizationId: string;
  siteId: string;
  deviceName: string;
  deviceIdentifier: string;
  providerType: string;
  enabled: boolean;
  status: HardwareDeviceStatus;
  health: DeviceHealthSnapshot;
  lastReading: NormalizedWeightReading | null;
  lastError: string | null;
  lastConnectedAt: string | null;
  reconnectAttempts: number;
};

export type HardwareStatusTransition = {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  profileId: string;
  deviceName: string;
  from: HardwareDeviceStatus;
  to: HardwareDeviceStatus;
  lastError: string | null;
  incidentKey: string;
};

export type HardwareReadingEvent = {
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  reading: NormalizedWeightReading;
};

export type ConnectionManagerHooks = {
  persist?: (snapshot: ManagedDeviceSnapshot) => Promise<void>;
  onTransition?: (event: HardwareStatusTransition) => void;
  onReading?: (event: HardwareReadingEvent) => void;
  now?: () => Date;
};

type ManagedDevice = {
  input: ProviderFactoryInput;
  organizationId: string;
  siteId: string;
  deviceName: string;
  enabled: boolean;
  reconnectEnabled: boolean;
  reconnectDelayMs: number;
  maxReconnectAttempts: number;
  healthTimeoutMs: number;
  pollingIntervalMs: number;
  provider: IWeightProvider;
  lastReading: NormalizedWeightReading | null;
  lastError: string | null;
  lastConnectedAt: Date | null;
  lastCommunicationAt: Date | null;
  lastSuccessfulReadingAt: Date | null;
  lastStatus: HardwareDeviceStatus;
  reconnectAttempts: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  incidentKey: string | null;
  quiet: boolean;
};

export class ConnectionManager {
  private readonly devices = new Map<string, ManagedDevice>();
  private readonly hooks: ConnectionManagerHooks;
  private readonly createProvider: (input: ProviderFactoryInput) => IWeightProvider;

  constructor(
    hooks: ConnectionManagerHooks = {},
    createProvider: (input: ProviderFactoryInput) => IWeightProvider = createWeightProvider,
  ) {
    this.hooks = hooks;
    this.createProvider = createProvider;
  }

  has(weighbridgeId: string): boolean {
    return this.devices.has(weighbridgeId);
  }

  listSnapshots(): ManagedDeviceSnapshot[] {
    return [...this.devices.values()].map((device) => this.toSnapshot(device));
  }

  getSnapshot(weighbridgeId: string): ManagedDeviceSnapshot | null {
    const device = this.devices.get(weighbridgeId);
    return device ? this.toSnapshot(device) : null;
  }

  getReading(weighbridgeId: string): NormalizedWeightReading | null {
    return this.devices.get(weighbridgeId)?.lastReading ?? null;
  }

  async start(
    input: ProviderFactoryInput & {
      organizationId: string;
      siteId: string;
      deviceName: string;
      enabled: boolean;
      reconnectEnabled: boolean;
      reconnectDelayMs: number;
      maxReconnectAttempts: number;
    },
    options: { quiet?: boolean } = {},
  ): Promise<ManagedDeviceSnapshot> {
    const existing = this.devices.get(input.weighbridgeId);
    if (existing) {
      return this.toSnapshot(existing);
    }

    const provider = this.createProvider(input);
    const device: ManagedDevice = {
      input,
      organizationId: input.organizationId,
      siteId: input.siteId,
      deviceName: input.deviceName,
      enabled: input.enabled,
      reconnectEnabled: input.reconnectEnabled,
      reconnectDelayMs: input.reconnectDelayMs,
      maxReconnectAttempts: input.maxReconnectAttempts,
      healthTimeoutMs: input.healthTimeoutMs,
      pollingIntervalMs: input.pollingIntervalMs,
      provider,
      lastReading: null,
      lastError: null,
      lastConnectedAt: null,
      lastCommunicationAt: null,
      lastSuccessfulReadingAt: null,
      lastStatus: "DISCONNECTED",
      reconnectAttempts: 0,
      pollTimer: null,
      reconnectTimer: null,
      incidentKey: null,
      quiet: options.quiet === true,
    };
    this.devices.set(input.weighbridgeId, device);

    if (!input.enabled) {
      await this.applyStatus(device, "DISABLED", null);
      return this.toSnapshot(device);
    }

    await this.connectDevice(device);
    return this.toSnapshot(device);
  }

  async stop(weighbridgeId: string, reason = "Device stopped", options: { quiet?: boolean } = {}): Promise<ManagedDeviceSnapshot | null> {
    const device = this.devices.get(weighbridgeId);
    if (!device) {
      return null;
    }
    this.clearTimers(device);
    if (options.quiet) {
      device.quiet = true;
    }
    try {
      await device.provider.disconnect();
    } catch {
      // Provider disconnect must not crash the manager.
    }
    device.enabled = false;
    await this.applyStatus(device, "DISABLED", reason);
    this.devices.delete(weighbridgeId);
    return this.toSnapshot(device);
  }

  async restart(input: Parameters<ConnectionManager["start"]>[0]): Promise<ManagedDeviceSnapshot> {
    if (this.devices.has(input.weighbridgeId)) {
      await this.stop(input.weighbridgeId, "Device restarted");
    }
    return this.start(input);
  }

  async read(weighbridgeId: string): Promise<NormalizedWeightReading | null> {
    const device = this.devices.get(weighbridgeId);
    if (!device) {
      return null;
    }
    return this.pollDevice(device);
  }

  async test(input: Parameters<ConnectionManager["start"]>[0]): Promise<{
    ok: boolean;
    snapshot: ManagedDeviceSnapshot;
    reading: NormalizedWeightReading | null;
    message: string;
  }> {
    const already = this.devices.has(input.weighbridgeId);
    if (!already) {
      await this.start({ ...input, enabled: true }, { quiet: true });
    }
    const device = this.devices.get(input.weighbridgeId);
    if (!device) {
      return { ok: false, snapshot: this.emptySnapshot(input), reading: null, message: "Device is not available" };
    }
    if (!already) {
      await this.connectDevice(device);
    }
    const reading = await this.pollDevice(device);
    const ok = device.provider.getStatus() === "CONNECTED";
    const snapshot = this.toSnapshot(device);
    if (!already) {
      await this.stop(input.weighbridgeId, "Connection test finished", { quiet: true });
    }
    return {
      ok,
      snapshot,
      reading,
      message: ok ? "Connection test succeeded" : (device.lastError ?? "Connection test failed"),
    };
  }

  async shutdown(): Promise<void> {
    const ids = [...this.devices.keys()];
    for (const id of ids) {
      await this.stop(id, "Runtime shutdown");
    }
  }

  private async connectDevice(device: ManagedDevice): Promise<void> {
    await this.applyStatus(device, "CONNECTING", null);
    try {
      await device.provider.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      await this.applyStatus(device, "ERROR", message);
      this.scheduleReconnect(device);
      return;
    }

    const status = device.provider.getStatus();
    if (status === "CONNECTED") {
      device.reconnectAttempts = 0;
      device.lastConnectedAt = this.now();
      await this.applyStatus(device, "CONNECTED", null);
      this.startPolling(device);
      await this.pollDevice(device);
      return;
    }

    const health = await device.provider.healthCheck();
    await this.applyStatus(device, status, health.lastError ?? "Provider did not connect");
    if (status === "ERROR" || status === "DISCONNECTED") {
      this.scheduleReconnect(device);
    }
  }

  private startPolling(device: ManagedDevice): void {
    if (device.pollTimer) {
      return;
    }
    device.pollTimer = setInterval(() => {
      void this.pollDevice(device).catch(() => undefined);
      this.checkHealth(device);
    }, device.pollingIntervalMs);
  }

  private async pollDevice(device: ManagedDevice): Promise<NormalizedWeightReading | null> {
    try {
      const reading = await device.provider.readNormalized();
      device.lastReading = reading;
      device.lastCommunicationAt = this.now();
      if (reading.quality === "STABLE" || reading.quality === "UNSTABLE") {
        device.lastSuccessfulReadingAt = device.lastCommunicationAt;
        device.lastError = null;
      } else if (reading.statusDetail) {
        device.lastError = reading.statusDetail;
      }
      const status = device.provider.getStatus();
      if (status !== device.lastStatus) {
        await this.applyStatus(device, status, device.lastError);
      }
      if (!device.quiet) {
        this.hooks.onReading?.({
          organizationId: device.organizationId,
          siteId: device.siteId,
          weighbridgeId: device.input.weighbridgeId,
          reading,
        });
      }
      return reading;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Weight read failed";
      device.lastError = message;
      await this.applyStatus(device, "ERROR", message);
      this.scheduleReconnect(device);
      return null;
    }
  }

  private checkHealth(device: ManagedDevice): void {
    if (device.lastStatus !== "CONNECTED" || !device.lastCommunicationAt) {
      return;
    }
    if (this.now().getTime() - device.lastCommunicationAt.getTime() <= device.healthTimeoutMs) {
      return;
    }
    void this.applyStatus(device, "DISCONNECTED", "No data received within the configured health timeout");
    this.scheduleReconnect(device);
  }

  private scheduleReconnect(device: ManagedDevice): void {
    if (!device.enabled || !device.reconnectEnabled) {
      return;
    }
    if (device.reconnectAttempts >= device.maxReconnectAttempts) {
      return;
    }
    if (device.reconnectTimer) {
      return;
    }
    device.reconnectTimer = setTimeout(() => {
      device.reconnectTimer = null;
      device.reconnectAttempts += 1;
      void this.connectDevice(device);
    }, device.reconnectDelayMs);
  }

  private async applyStatus(device: ManagedDevice, status: HardwareDeviceStatus, error: string | null): Promise<void> {
    const from = device.lastStatus;
    device.lastStatus = status;
    device.lastError = error;
    if (status === "CONNECTED") {
      device.lastConnectedAt = device.lastConnectedAt ?? this.now();
    }
    if (from !== status) {
      if (status === "DISCONNECTED" || status === "ERROR" || status === "DISABLED") {
        device.incidentKey = `${device.input.weighbridgeId}:${this.now().getTime()}`;
      }
      if (!device.quiet) {
        this.hooks.onTransition?.({
          organizationId: device.organizationId,
          siteId: device.siteId,
          weighbridgeId: device.input.weighbridgeId,
          profileId: device.input.profileId,
          deviceName: device.deviceName,
          from,
          to: status,
          lastError: error,
          incidentKey: device.incidentKey ?? `${device.input.weighbridgeId}:${this.now().getTime()}`,
        });
      }
      await this.hooks.persist?.(this.toSnapshot(device));
    }
  }

  private clearTimers(device: ManagedDevice): void {
    if (device.pollTimer) {
      clearInterval(device.pollTimer);
      device.pollTimer = null;
    }
    if (device.reconnectTimer) {
      clearTimeout(device.reconnectTimer);
      device.reconnectTimer = null;
    }
  }

  private toSnapshot(device: ManagedDevice): ManagedDeviceSnapshot {
    const health = deriveDeviceHealth({
      enabled: device.enabled,
      status: device.lastStatus,
      lastCommunicationAt: device.lastCommunicationAt,
      lastSuccessfulReadingAt: device.lastSuccessfulReadingAt,
      lastError: device.lastError,
      now: this.now(),
      healthTimeoutMs: device.healthTimeoutMs,
    });
    return {
      weighbridgeId: device.input.weighbridgeId,
      profileId: device.input.profileId,
      organizationId: device.organizationId,
      siteId: device.siteId,
      deviceName: device.deviceName,
      deviceIdentifier: device.input.deviceIdentifier,
      providerType: device.input.providerType,
      enabled: device.enabled,
      status: device.lastStatus,
      health: {
        ...health,
        lastConnectedAt: device.lastConnectedAt?.toISOString() ?? null,
      },
      lastReading: device.lastReading,
      lastError: device.lastError,
      lastConnectedAt: device.lastConnectedAt?.toISOString() ?? null,
      reconnectAttempts: device.reconnectAttempts,
    };
  }

  private emptySnapshot(input: ProviderFactoryInput & { organizationId: string; siteId: string; deviceName: string }): ManagedDeviceSnapshot {
    return {
      weighbridgeId: input.weighbridgeId,
      profileId: input.profileId,
      organizationId: input.organizationId,
      siteId: input.siteId,
      deviceName: input.deviceName,
      deviceIdentifier: input.deviceIdentifier,
      providerType: input.providerType,
      enabled: false,
      status: "DISCONNECTED",
      health: {
        status: "DISCONNECTED",
        healthy: false,
        lastSuccessfulReadingAt: null,
        lastCommunicationAt: null,
        lastConnectedAt: null,
        lastError: "Device is not running",
      },
      lastReading: null,
      lastError: "Device is not running",
      lastConnectedAt: null,
      reconnectAttempts: 0,
    };
  }

  private now(): Date {
    return this.hooks.now?.() ?? new Date();
  }
}

let singleton: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!singleton) {
    singleton = new ConnectionManager();
  }
  return singleton;
}

export function setConnectionManager(manager: ConnectionManager | null): void {
  singleton = manager;
}
