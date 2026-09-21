import { edgeEnv } from "../config/env.js";
import type { EdgeEventEnvelope } from "../events/envelope.js";
import type { EventPriority } from "../queue/types.js";
import type { ConfigCache, GatewayRuntimeState } from "../store/types.js";

export type BackendDevice = {
  id: string;
  code: string;
  name: string;
  deviceType: string;
  enabled: boolean;
  status: string;
  provider?: string;
  protocolReadiness?: string;
  adapterKey?: string | null;
  serialPort?: string | null;
  host?: string | null;
  port?: number | null;
};

export type BackendGateway = {
  id: string;
  code: string;
  name: string;
  status: string;
  site: { id: string; code: string; name: string };
};

export type SyncAck = {
  eventId: string;
  status: "ACCEPTED" | "ALREADY_PROCESSED" | "CONFLICT" | "REJECTED" | "DEPENDENCY_PENDING";
  message: string | null;
  conflictId: string | null;
  weighmentId: string | null;
  transactionId: string | null;
  alreadyProcessed: boolean;
};

export type BootstrapResult = {
  gateway: BackendGateway;
  devices: BackendDevice[];
  config: ConfigCache;
};

export class BackendUnavailableError extends Error {
  constructor(message = "Backend is unavailable") {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

export class GatewayAuthError extends Error {
  constructor(message = "Gateway authentication failed") {
    super(message);
    this.name = "GatewayAuthError";
  }
}

export class GatewayClient {
  constructor(
    private readonly backendUrl: string,
    private readonly token: string,
  ) {}

  async bootstrap(): Promise<BootstrapResult> {
    return this.request("GET", "/api/v1/edge/bootstrap");
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  async heartbeat(body: Record<string, unknown>): Promise<{ gateway: BackendGateway }> {
    return this.request("POST", "/api/v1/edge/heartbeat", body);
  }

  async ingest(envelope: EdgeEventEnvelope): Promise<{
    event: { eventId: string; alreadyProcessed: boolean; weighmentId: string | null; anprDetectionId: string | null };
  }> {
    return this.request("POST", "/api/v1/edge/events", envelope);
  }

  async syncBatch(input: {
    events: Array<{
      envelope: EdgeEventEnvelope;
      priority: EventPriority;
      localTransactionId: string | null;
      dependsOn: string[];
      payloadHash: string | null;
    }>;
    snapshot: GatewayRuntimeState & {
      queued: number;
      syncing: number;
      synced: number;
      failed: number;
      deadLetter: number;
      configVersion: string | null;
      configCachedAt: string | null;
      configStale: boolean;
    };
  }): Promise<{ results: SyncAck[] }> {
    return this.request("POST", "/api/v1/edge/sync/batch", input);
  }

  async uploadFile(input: {
    fileId: string;
    contentHash: string;
    mimeType: string;
    sizeBytes: number;
    eventId: string | null;
    contentBase64: string;
  }): Promise<{ fileId: string; alreadyProcessed: boolean }> {
    return this.request("POST", "/api/v1/edge/sync/files", input);
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.backendUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new BackendUnavailableError();
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : `Backend request failed (${response.status})`;
      if (response.status === 401 || response.status === 403) {
        throw new GatewayAuthError(message);
      }
      if (response.status >= 500) {
        throw new BackendUnavailableError(message);
      }
      throw new Error(message);
    }
    return payload as T;
  }
}

export function createGatewayClient(): GatewayClient {
  return new GatewayClient(edgeEnv.backendUrl, edgeEnv.gatewayToken);
}
