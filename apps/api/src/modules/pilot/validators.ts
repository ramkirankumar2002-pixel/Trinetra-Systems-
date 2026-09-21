import { CommissioningTestResult, HardwareInstallationStatus, HardwareProtocolReadiness, OperationMode } from "@prisma/client";
import { isCommissioningTestResult, isKnownCommissioningTestKey } from "../../domain/commissioningChecklist.js";
import { isHardwareInstallationStatus } from "../../domain/hardwareInstallation.js";
import { rejectWeightOffset } from "../../domain/metrologyBoundary.js";
import { isOperationMode } from "../../domain/operationMode.js";
import { isHardwareAdapterKey, isHardwareProtocolReadiness } from "../../domain/protocolReadiness.js";
import { rejectSecretFields } from "../../domain/edgeSecrets.js";
import { HttpError } from "../../lib/httpError.js";

export type UpdateSiteModeInput = {
  operationMode: OperationMode;
};

export type RecordCommissioningInput = {
  deviceId?: string | undefined;
  testKey: string;
  result: CommissioningTestResult;
  notes: string | null;
  error: string | null;
};

export type UpdateInventoryInput = {
  manufacturer?: string | null | undefined;
  model?: string | null | undefined;
  serialNumber?: string | null | undefined;
  protocol?: string | null | undefined;
  connectionType?: string | null | undefined;
  firmwareVersion?: string | null | undefined;
  notes?: string | null | undefined;
  host?: string | null | undefined;
  port?: number | null | undefined;
  serialPort?: string | null | undefined;
  adapterKey?: string | null | undefined;
  protocolReadiness?: HardwareProtocolReadiness | undefined;
  installationStatus?: HardwareInstallationStatus | undefined;
  enabled?: boolean | undefined;
};

export function parseUpdateSiteModeInput(body: unknown): UpdateSiteModeInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Site mode details are required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.operationMode !== "string" || !isOperationMode(record.operationMode)) {
    throw new HttpError(400, "A valid operation mode is required");
  }
  return { operationMode: record.operationMode };
}

export function parseRecordCommissioningInput(body: unknown): RecordCommissioningInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Commissioning details are required");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.testKey !== "string" || !isKnownCommissioningTestKey(record.testKey)) {
    throw new HttpError(400, "A valid commissioning test is required");
  }
  if (typeof record.result !== "string" || !isCommissioningTestResult(record.result)) {
    throw new HttpError(400, "A valid commissioning result is required");
  }
  return {
    ...(typeof record.deviceId === "string" && record.deviceId !== "" ? { deviceId: record.deviceId } : {}),
    testKey: record.testKey,
    result: record.result,
    notes: optionalText(record.notes),
    error: optionalText(record.error),
  };
}

export function parseUpdateInventoryInput(body: unknown): UpdateInventoryInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Device inventory details are required");
  }
  const secretError = rejectSecretFields(body);
  if (secretError) {
    throw new HttpError(400, secretError);
  }
  const offsetError = rejectWeightOffset(body);
  if (offsetError) {
    throw new HttpError(400, offsetError);
  }
  const record = body as Record<string, unknown>;
  if (record.protocolReadiness !== undefined) {
    if (typeof record.protocolReadiness !== "string" || !isHardwareProtocolReadiness(record.protocolReadiness)) {
      throw new HttpError(400, "A valid protocol readiness value is required");
    }
    if (record.protocolReadiness === "DOCUMENTED") {
      throw new HttpError(400, "Documented manufacturer protocol details are not available");
    }
  }
  if (record.installationStatus !== undefined) {
    if (typeof record.installationStatus !== "string" || !isHardwareInstallationStatus(record.installationStatus)) {
      throw new HttpError(400, "A valid installation status is required");
    }
  }
  if (record.adapterKey !== undefined && record.adapterKey !== null && record.adapterKey !== "") {
    if (typeof record.adapterKey !== "string" || !isHardwareAdapterKey(record.adapterKey)) {
      throw new HttpError(400, "A valid adapter key is required");
    }
  }
  if (record.port !== undefined && record.port !== null) {
    if (typeof record.port !== "number" || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535) {
      throw new HttpError(400, "A valid TCP port is required");
    }
  }

  return {
    ...(record.manufacturer === undefined ? {} : { manufacturer: optionalText(record.manufacturer) }),
    ...(record.model === undefined ? {} : { model: optionalText(record.model) }),
    ...(record.serialNumber === undefined ? {} : { serialNumber: optionalText(record.serialNumber) }),
    ...(record.protocol === undefined ? {} : { protocol: optionalText(record.protocol) }),
    ...(record.connectionType === undefined ? {} : { connectionType: optionalText(record.connectionType) }),
    ...(record.firmwareVersion === undefined ? {} : { firmwareVersion: optionalText(record.firmwareVersion) }),
    ...(record.notes === undefined ? {} : { notes: optionalText(record.notes) }),
    ...(record.host === undefined ? {} : { host: optionalText(record.host) }),
    ...(record.port === undefined ? {} : { port: record.port === null ? null : record.port }),
    ...(record.serialPort === undefined ? {} : { serialPort: optionalText(record.serialPort) }),
    ...(record.adapterKey === undefined ? {} : { adapterKey: optionalText(record.adapterKey) }),
    ...(typeof record.protocolReadiness === "string"
      ? { protocolReadiness: record.protocolReadiness as HardwareProtocolReadiness }
      : {}),
    ...(typeof record.installationStatus === "string"
      ? { installationStatus: record.installationStatus as HardwareInstallationStatus }
      : {}),
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
  };
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "A valid text value is required");
  }
  return value.trim();
}
