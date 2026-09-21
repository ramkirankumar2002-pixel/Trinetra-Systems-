import { apiRequest } from "../../shared/api/client.ts";

export type PublicWeighbridge = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  operationalStatus: "AVAILABLE" | "BUSY" | "MAINTENANCE" | "OFFLINE";
  site: { id: string; code: string; name: string };
  hardware: {
    providerType: string;
    status: string;
    enabled: boolean;
    healthy: boolean;
    lastWeightKg: string | null;
    lastQuality: string | null;
  } | null;
  camera: {
    id: string;
    name: string;
    purpose: string;
    status: string;
    enabled: boolean;
    anprStatus: string;
    simulated: boolean;
  } | null;
};

export type PublicHardwareDevice = {
  id: string;
  weighbridgeId: string;
  weighbridgeCode: string;
  weighbridgeName: string;
  site: { id: string; code: string; name: string };
  deviceName: string;
  deviceIdentifier: string;
  providerType: string;
  connectionType: string;
  enabled: boolean;
  status: string;
  healthy: boolean;
  unit: string;
  lastWeightKg: string | null;
  lastQuality: string | null;
  lastReadingAt: string | null;
  lastConnectedAt: string | null;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastSource: string | null;
  pollingIntervalMs: number;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  baudRate: number | null;
  simulatorMode: string;
};

export type LiveWeightResponse = {
  device: {
    weighbridgeId: string;
    weighbridgeCode: string;
    deviceName: string;
    deviceIdentifier: string;
    providerType: string;
    status: string;
    healthy: boolean;
    enabled: boolean;
  };
  reading: {
    weightKg: string | null;
    unit: string;
    quality: string;
    timestamp: string | null;
    providerType: string;
    source: string;
    deviceIdentifier: string;
    weighbridgeId: string;
    connectionStatus: string;
    statusDetail: string | null;
  };
};

export type SimulatedAnpr = {
  plate: string;
  displayPlate: string;
  confidence: number;
  source: string;
  provider: string;
  readAt: string;
};

export type SimulatedWeight = {
  kg: number;
  asDecimal: string;
  readAt: string;
  source: string;
  provider: string;
  weighbridgeId: string;
};

export function listWeighbridges(): Promise<{ items: PublicWeighbridge[] }> {
  return apiRequest<{ items: PublicWeighbridge[] }>("/api/v1/weighbridges");
}

export function simulateAnpr(weighbridgeId: string): Promise<{ detection: SimulatedAnpr; simulated: true }> {
  return apiRequest<{ detection: SimulatedAnpr; simulated: true }>(
    `/api/v1/weighbridges/${weighbridgeId}/anpr/simulate`,
    { method: "POST" },
  );
}

export function simulateWeight(weighbridgeId: string): Promise<{ reading: SimulatedWeight; simulated: true }> {
  return apiRequest<{ reading: SimulatedWeight; simulated: true }>(
    `/api/v1/weighbridges/${weighbridgeId}/weight/simulate`,
    { method: "POST" },
  );
}

export function listHardwareDevices(): Promise<{ items: PublicHardwareDevice[] }> {
  return apiRequest<{ items: PublicHardwareDevice[] }>("/api/v1/weighbridges/hardware");
}

export function getLiveWeight(weighbridgeId: string): Promise<LiveWeightResponse> {
  return apiRequest<LiveWeightResponse>(`/api/v1/weighbridges/${weighbridgeId}/live-weight`);
}

export function enableHardwareDevice(weighbridgeId: string): Promise<{ device: PublicHardwareDevice }> {
  return apiRequest<{ device: PublicHardwareDevice }>(`/api/v1/weighbridges/${weighbridgeId}/hardware/enable`, {
    method: "POST",
  });
}

export function disableHardwareDevice(weighbridgeId: string): Promise<{ device: PublicHardwareDevice }> {
  return apiRequest<{ device: PublicHardwareDevice }>(`/api/v1/weighbridges/${weighbridgeId}/hardware/disable`, {
    method: "POST",
  });
}

export function testHardwareDevice(weighbridgeId: string): Promise<{
  ok: boolean;
  message: string;
  device: PublicHardwareDevice;
}> {
  return apiRequest<{ ok: boolean; message: string; device: PublicHardwareDevice }>(
    `/api/v1/weighbridges/${weighbridgeId}/hardware/test`,
    { method: "POST" },
  );
}

export function refreshHardwareDevice(weighbridgeId: string): Promise<{ device: PublicHardwareDevice }> {
  return apiRequest<{ device: PublicHardwareDevice }>(`/api/v1/weighbridges/${weighbridgeId}/hardware/refresh`, {
    method: "POST",
  });
}

export function sourceLabel(source: string): string {
  if (source === "HARDWARE") {
    return "HARDWARE";
  }
  if (source === "SIMULATOR" || source === "SIMULATED") {
    return "SIMULATED";
  }
  return "MANUAL";
}
