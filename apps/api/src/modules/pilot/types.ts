import type {
  CommissioningTestResult,
  EdgeDeviceType,
  HardwareDeviceStatus,
  HardwareInstallationStatus,
  HardwareProtocolReadiness,
  OperationMode,
} from "@prisma/client";

export type PublicHardwareInventoryDevice = {
  id: string;
  deviceId: string;
  deviceType: EdgeDeviceType;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  site: { id: string; code: string; name: string; operationMode: OperationMode };
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
  installationStatus: HardwareInstallationStatus;
  protocolReadiness: HardwareProtocolReadiness;
  status: HardwareDeviceStatus;
  lastCommunicationAt: string | null;
  lastError: string | null;
  lastWeightKg: string | number | null;
  lastStability: string | boolean | null;
  lastPlate: string | null;
  lastConfidence: number | null;
  lastScan: string | null;
  lastFrameAvailable: boolean;
  diagnostic: unknown;
  lastClockIssue: string | null;
  gateway: { id: string; code: string; name: string; status: string; softwareVersion: string | null; lastHeartbeatAt: string | null };
};

export type PublicCommissioningTest = {
  id: string;
  deviceId: string | null;
  testKey: string;
  testType: string;
  label: string;
  result: CommissioningTestResult;
  notes: string | null;
  error: string | null;
  testedAt: string | null;
  testedBy: { id: string; fullName: string } | null;
};

export type PublicPilotOverview = {
  operationModes: OperationMode[];
  sites: Array<{ id: string; code: string; name: string; operationMode: OperationMode }>;
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
  devices: PublicHardwareInventoryDevice[];
  commissioning: PublicCommissioningTest[];
  metrologyNotice: string;
  realAdaptersFinalized: false;
  hardwareInformationRequired: string;
  discovery: unknown;
  unsafeControlsDisabled: true;
};
