import { apiRequest } from "../../shared/api/client.ts";

export type PublicPilotDevice = {
  id: string;
  deviceId: string;
  deviceType: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  site: { id: string; code: string; name: string; operationMode: string };
  weighbridge: { id: string; code: string; name: string } | null;
  connectionType: string | null;
  protocol: string | null;
  host: string | null;
  port: number | null;
  serialPort: string | null;
  enabled: boolean;
  adapter: string;
  firmwareVersion: string | null;
  notes: string | null;
  installationStatus: string;
  protocolReadiness: string;
  status: string;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastWeightKg: string | number | null;
  lastStability: string | boolean | null;
  lastPlate: string | null;
  lastConfidence: number | null;
  lastScan: string | null;
  lastFrameAvailable: boolean;
  diagnostic: {
    connectionStatus?: string;
    raw?: string | null;
    parsedWeightKg?: number | string | null;
    stable?: boolean | string | null;
    timestamp?: string | null;
    parserStatus?: string | null;
    lastError?: string | null;
    testKind?: string;
  } | null;
  lastClockIssue: string | null;
  gateway: {
    id: string;
    code: string;
    name: string;
    status: string;
    softwareVersion: string | null;
    lastHeartbeatAt: string | null;
  };
};

export type PublicCommissioningTest = {
  id: string;
  deviceId: string | null;
  testKey: string;
  testType: string;
  label: string;
  result: string;
  notes: string | null;
  error: string | null;
  testedAt: string | null;
  testedBy: { id: string; fullName: string } | null;
};

export type PublicPilotOverview = {
  sites: Array<{ id: string; code: string; name: string; operationMode: string }>;
  gateways: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    site: { id: string; code: string; name: string };
    softwareVersion: string | null;
    lastHeartbeatAt: string | null;
    connectedDeviceCount: number;
  }>;
  devices: PublicPilotDevice[];
  commissioning: PublicCommissioningTest[];
  metrologyNotice: string;
  realAdaptersFinalized: false;
  hardwareInformationRequired: string;
};

export async function getPilotOverview(): Promise<PublicPilotOverview> {
  return apiRequest("/api/v1/pilot");
}

export async function updateSiteMode(siteId: string, operationMode: string): Promise<{ site: { operationMode: string } }> {
  return apiRequest(`/api/v1/pilot/sites/${siteId}/mode`, {
    method: "PATCH",
    body: JSON.stringify({ operationMode }),
  });
}

export async function updatePilotDevice(
  deviceId: string,
  body: { notes?: string | null; installationStatus?: string; protocolReadiness?: string },
): Promise<{ device: PublicPilotDevice }> {
  return apiRequest(`/api/v1/pilot/devices/${deviceId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function recordCommissioningTest(body: {
  deviceId?: string;
  testKey: string;
  result: string;
  notes?: string;
}): Promise<{ test: PublicCommissioningTest }> {
  return apiRequest("/api/v1/pilot/commissioning", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function devicesByType(devices: PublicPilotDevice[], type: string): PublicPilotDevice[] {
  return devices.filter((device) => device.deviceType === type);
}

export function latestCommissioningResult(tests: PublicCommissioningTest[], group: string): string {
  const matching = tests.filter((test) => test.testType === group);
  if (matching.length === 0) {
    return "NOT_TESTED";
  }
  if (matching.every((test) => test.result === "PASS")) {
    return "PASS";
  }
  if (matching.some((test) => test.result === "FAIL")) {
    return "FAIL";
  }
  return "NOT_TESTED";
}
