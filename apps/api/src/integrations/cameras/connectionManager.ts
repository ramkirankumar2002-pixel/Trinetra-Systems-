import { deriveCameraHealth, type CameraDeviceStatus, type CameraHealthSnapshot } from "../../domain/cameraStatus.js";
import { createCameraProvider } from "./factory.js";
import type { CameraFactoryInput, CameraFrame, ICameraProvider } from "./types.js";

export type ManagedCameraSnapshot = {
  cameraId: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  name: string;
  cameraIdentifier: string;
  providerType: string;
  connectionType: string;
  enabled: boolean;
  status: CameraDeviceStatus;
  health: CameraHealthSnapshot;
  lastError: string | null;
  lastFrameAt: string | null;
  lastCommunicationAt: string | null;
};

export type CameraStatusTransition = {
  organizationId: string;
  siteId: string;
  cameraId: string;
  weighbridgeId: string;
  deviceName: string;
  from: CameraDeviceStatus;
  to: CameraDeviceStatus;
  lastError: string | null;
  incidentKey: string;
};

export type CameraManagerHooks = {
  persist?: (snapshot: ManagedCameraSnapshot) => Promise<void>;
  onTransition?: (event: CameraStatusTransition) => void;
};

type ManagedCamera = {
  input: CameraFactoryInput;
  provider: ICameraProvider;
  lastStatus: CameraDeviceStatus;
  lastError: string | null;
  lastFrameAt: string | null;
  lastCommunicationAt: string | null;
  incidentKey: string | null;
};

const HEALTH_TIMEOUT_MS = 60_000;

export class CameraConnectionManager {
  private readonly cameras = new Map<string, ManagedCamera>();

  constructor(
    private readonly hooks: CameraManagerHooks = {},
    private readonly createProvider: (input: CameraFactoryInput) => ICameraProvider = createCameraProvider,
  ) {}

  has(cameraId: string): boolean {
    return this.cameras.has(cameraId);
  }

  getSnapshot(cameraId: string): ManagedCameraSnapshot | null {
    const managed = this.cameras.get(cameraId);
    if (!managed) {
      return null;
    }
    return this.toSnapshot(managed);
  }

  async start(input: CameraFactoryInput): Promise<ManagedCameraSnapshot> {
    await this.stop(input.cameraId, null);
    const provider = this.createProvider(input);
    const managed: ManagedCamera = {
      input,
      provider,
      lastStatus: input.enabled ? "CONNECTING" : "DISABLED",
      lastError: input.enabled ? null : "Camera is disabled",
      lastFrameAt: null,
      lastCommunicationAt: null,
      incidentKey: null,
    };
    this.cameras.set(input.cameraId, managed);
    if (!input.enabled) {
      await this.persist(managed);
      return this.toSnapshot(managed);
    }

    await provider.initialize();
    this.syncFromProvider(managed);
    await this.persist(managed);
    return this.toSnapshot(managed);
  }

  async stop(cameraId: string, reason: string | null): Promise<void> {
    const managed = this.cameras.get(cameraId);
    if (!managed) {
      return;
    }
    await managed.provider.shutdown();
    const nextStatus: CameraDeviceStatus = reason === "Camera disabled" ? "DISABLED" : "DISCONNECTED";
    this.applyStatus(managed, nextStatus, reason);
    await this.persist(managed);
    this.cameras.delete(cameraId);
  }

  async shutdown(): Promise<void> {
    const ids = [...this.cameras.keys()];
    for (const cameraId of ids) {
      await this.stop(cameraId, "Runtime shutdown");
    }
  }

  async capture(cameraId: string): Promise<CameraFrame> {
    const managed = this.cameras.get(cameraId);
    if (!managed) {
      throw new Error("Camera is not started");
    }
    if (!managed.input.enabled) {
      throw new Error("Camera is disabled");
    }
    const frame = await managed.provider.captureFrame();
    this.syncFromProvider(managed);
    managed.lastFrameAt = frame.capturedAt;
    managed.lastCommunicationAt = frame.capturedAt;
    await this.persist(managed);
    return frame;
  }

  async test(input: CameraFactoryInput): Promise<{
    ok: boolean;
    message: string;
    snapshot: ManagedCameraSnapshot;
  }> {
    const previous = this.cameras.get(input.cameraId);
    const snapshot = await this.start({ ...input, enabled: true });
    try {
      if (snapshot.status !== "CONNECTED") {
        return {
          ok: false,
          message: snapshot.lastError ?? "Camera did not connect",
          snapshot,
        };
      }
      await this.capture(input.cameraId);
      const after = this.getSnapshot(input.cameraId);
      return {
        ok: true,
        message: input.cameraProviderType === "SIMULATOR" ? "Simulator camera captured a test frame" : "Camera connected",
        snapshot: after ?? snapshot,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Camera test failed",
        snapshot: this.getSnapshot(input.cameraId) ?? snapshot,
      };
    } finally {
      if (previous && !input.enabled) {
        await this.stop(input.cameraId, "Camera disabled");
      }
    }
  }

  private syncFromProvider(managed: ManagedCamera): void {
    const status = managed.provider.getStatus();
    this.applyStatus(managed, status.status, status.lastError);
    managed.lastFrameAt = status.lastFrameAt;
    managed.lastCommunicationAt = status.lastCommunicationAt;
  }

  private applyStatus(managed: ManagedCamera, status: CameraDeviceStatus, lastError: string | null): void {
    const from = managed.lastStatus;
    managed.lastStatus = status;
    managed.lastError = lastError;
    if (status === "CONNECTED") {
      managed.lastCommunicationAt = new Date().toISOString();
      managed.incidentKey = null;
    }
    if (from !== status) {
      const incidentKey = managed.incidentKey ?? `${managed.input.cameraId}:${Date.now()}`;
      managed.incidentKey = incidentKey;
      this.hooks.onTransition?.({
        organizationId: managed.input.organizationId,
        siteId: managed.input.siteId,
        cameraId: managed.input.cameraId,
        weighbridgeId: managed.input.weighbridgeId,
        deviceName: managed.input.name,
        from,
        to: status,
        lastError,
        incidentKey,
      });
    }
  }

  private toSnapshot(managed: ManagedCamera): ManagedCameraSnapshot {
    return {
      cameraId: managed.input.cameraId,
      organizationId: managed.input.organizationId,
      siteId: managed.input.siteId,
      weighbridgeId: managed.input.weighbridgeId,
      name: managed.input.name,
      cameraIdentifier: managed.input.cameraIdentifier,
      providerType: managed.input.cameraProviderType,
      connectionType: managed.input.connectionType,
      enabled: managed.input.enabled,
      status: managed.lastStatus,
      health: deriveCameraHealth({
        enabled: managed.input.enabled,
        status: managed.lastStatus,
        lastCommunicationAt: managed.lastCommunicationAt,
        lastFrameAt: managed.lastFrameAt,
        lastError: managed.lastError,
        healthTimeoutMs: HEALTH_TIMEOUT_MS,
      }),
      lastError: managed.lastError,
      lastFrameAt: managed.lastFrameAt,
      lastCommunicationAt: managed.lastCommunicationAt,
    };
  }

  private async persist(managed: ManagedCamera): Promise<void> {
    if (!this.hooks.persist) {
      return;
    }
    await this.hooks.persist(this.toSnapshot(managed));
  }
}

let manager = new CameraConnectionManager();

export function getCameraConnectionManager(): CameraConnectionManager {
  return manager;
}

export function setCameraConnectionManager(next: CameraConnectionManager): void {
  manager = next;
}
