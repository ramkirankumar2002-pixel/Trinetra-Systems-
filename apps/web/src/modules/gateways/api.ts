import { apiRequest } from "../../shared/api/client.ts";

export type PublicEdgeDevice = {
  id: string;
  gatewayId: string;
  code: string;
  name: string;
  deviceType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  protocol: string | null;
  connectionType: string | null;
  provider: string;
  weighbridgeId: string | null;
  cameraId: string | null;
  enabled: boolean;
  status: string;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastReadingSummary: unknown;
};

export type PublicEdgeGateway = {
  id: string;
  code: string;
  name: string;
  status: string;
  enabled: boolean;
  revoked: boolean;
  site: { id: string; code: string; name: string };
  softwareVersion: string | null;
  buildEnvironment: string | null;
  platform: string | null;
  connectedDeviceCount: number;
  lastHeartbeatAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
  registeredAt: string;
  devices?: PublicEdgeDevice[];
};

export async function listGateways(): Promise<{ items: Array<PublicEdgeGateway & { devices: PublicEdgeDevice[] }> }> {
  return apiRequest("/api/v1/gateways");
}

export async function enableGateway(id: string): Promise<{ gateway: PublicEdgeGateway }> {
  return apiRequest(`/api/v1/gateways/${id}/enable`, { method: "POST" });
}

export async function disableGateway(id: string): Promise<{ gateway: PublicEdgeGateway }> {
  return apiRequest(`/api/v1/gateways/${id}/disable`, { method: "POST" });
}

export async function updateEdgeDevice(
  gatewayId: string,
  deviceId: string,
  body: { enabled?: boolean; name?: string },
): Promise<{ device: PublicEdgeDevice }> {
  return apiRequest(`/api/v1/gateways/${gatewayId}/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function testEdgeDevice(
  gatewayId: string,
  deviceId: string,
): Promise<{ ok: boolean; message: string; device: PublicEdgeDevice }> {
  return apiRequest(`/api/v1/gateways/${gatewayId}/devices/${deviceId}/test`, { method: "POST" });
}

export function heartbeatAgeLabel(iso: string | null, nowMs = Date.now()): string {
  if (!iso) {
    return "Never";
  }
  const age = Math.max(0, nowMs - Date.parse(iso));
  if (age < 60_000) {
    return `${Math.round(age / 1000)} seconds ago`;
  }
  if (age < 3_600_000) {
    return `${Math.round(age / 60_000)} minutes ago`;
  }
  return new Date(iso).toLocaleString();
}
