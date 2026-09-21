import { randomUUID } from "node:crypto";
import { edgeEnv } from "../config/env.js";
import type { ICameraProvider, IScannerProvider, IWeightProvider } from "../adapters/types.js";
import type { BoundDevice } from "../devices/registry.js";
import { createEnvelope, type EdgeEventEnvelope } from "./envelope.js";

export async function weightEventFromAdapter(
  gatewayId: string,
  device: BoundDevice,
  adapter: IWeightProvider,
  extras: Record<string, unknown> = {},
): Promise<EdgeEventEnvelope> {
  const reading = await adapter.readWeight();
  const gatewayReceiveTime = new Date().toISOString();
  return createEnvelope({
    eventId: randomUUID(),
    gatewayId,
    deviceId: device.id,
    deviceType: "WEIGHBRIDGE_INDICATOR",
    eventType: "DEVICE_WEIGHT_READING",
    deviceEventTime: reading.capturedAt,
    gatewayReceiveTime,
    softwareVersion: edgeEnv.softwareVersion,
    payload: {
      weightKg: reading.weightKg,
      unit: reading.unit,
      quality: reading.quality,
      connectionStatus: reading.connectionStatus,
      source: reading.source,
      ...extras,
    },
  });
}

export async function anprEventFromAdapter(
  gatewayId: string,
  device: BoundDevice,
  adapter: ICameraProvider,
): Promise<EdgeEventEnvelope> {
  const reading = await adapter.readPlate();
  return createEnvelope({
    eventId: randomUUID(),
    gatewayId,
    deviceId: device.id,
    deviceType: "CAMERA",
    eventType: "DEVICE_ANPR_DETECTION",
    deviceEventTime: reading.capturedAt,
    gatewayReceiveTime: new Date().toISOString(),
    softwareVersion: edgeEnv.softwareVersion,
    payload: {
      plateNumber: reading.plateNumber,
      normalizedPlateNumber: reading.normalizedPlateNumber,
      displayPlateNumber: reading.displayPlateNumber,
      confidence: reading.confidence,
      candidates: reading.candidates,
      simulated: reading.simulated,
      provider: reading.provider,
    },
  });
}

export async function scanEventFromAdapter(
  gatewayId: string,
  device: BoundDevice,
  adapter: IScannerProvider,
  extras: Record<string, unknown> = {},
): Promise<EdgeEventEnvelope> {
  const reading = await adapter.readDocument();
  return createEnvelope({
    eventId: randomUUID(),
    gatewayId,
    deviceId: device.id,
    deviceType: "SCANNER",
    eventType: "DEVICE_SCAN_COMPLETED",
    deviceEventTime: reading.capturedAt,
    gatewayReceiveTime: new Date().toISOString(),
    softwareVersion: edgeEnv.softwareVersion,
    payload: {
      fileName: reading.fileName,
      mimeType: reading.mimeType,
      contentBase64: reading.contentBase64,
      documentType: reading.documentType,
      ...extras,
    },
  });
}
