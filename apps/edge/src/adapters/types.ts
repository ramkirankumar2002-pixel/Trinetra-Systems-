import type { EdgeDeviceType } from "../events/envelope.js";

export type AdapterHealth = {
  status: "CONNECTED" | "DISCONNECTED" | "CONNECTING" | "ERROR" | "DISABLED";
  lastCommunicationAt: string | null;
  lastError: string | null;
};

export type IDeviceAdapter = {
  readonly deviceType: EdgeDeviceType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  health(): AdapterHealth;
  diagnostic?(): Record<string, unknown>;
};

export type NormalizedWeightReading = {
  weightKg: number;
  unit: "KG";
  quality: "STABLE" | "UNSTABLE" | "INVALID" | "NO_DATA" | "DEVICE_ERROR";
  connectionStatus: "CONNECTED" | "DISCONNECTED" | "ERROR";
  source: "SIMULATED" | "HARDWARE";
  capturedAt: string;
};

export type IWeightProvider = IDeviceAdapter & {
  readWeight(): Promise<NormalizedWeightReading>;
};

export type NormalizedAnprResult = {
  plateNumber: string;
  normalizedPlateNumber: string;
  displayPlateNumber: string;
  confidence: number;
  candidates: Array<{ plateNumber: string; normalizedPlateNumber: string; confidence: number }>;
  simulated: boolean;
  provider: string;
  capturedAt: string;
};

export type ICameraProvider = IDeviceAdapter & {
  readPlate(): Promise<NormalizedAnprResult>;
};

export type NormalizedScanResult = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  documentType: string;
  capturedAt: string;
};

export type IScannerProvider = IDeviceAdapter & {
  readDocument(): Promise<NormalizedScanResult>;
};
