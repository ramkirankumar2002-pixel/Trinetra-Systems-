import { CameraProviderType, HardwareDeviceStatus } from "@prisma/client";
import type { CameraSimulatorScenario } from "../../domain/cameraConfig.js";
import { isCameraSimulatorScenario } from "../../domain/cameraConfig.js";
import { prisma } from "../../db/client.js";
import { emitCameraTransition } from "./alerts.js";
import {
  CameraConnectionManager,
  getCameraConnectionManager,
  setCameraConnectionManager,
  type ManagedCameraSnapshot,
} from "./connectionManager.js";
import type { CameraFactoryInput } from "./types.js";

export async function startCameraRuntime(): Promise<void> {
  const manager = new CameraConnectionManager({
    persist: persistSnapshot,
    onTransition: emitCameraTransition,
  });
  setCameraConnectionManager(manager);

  const cameras = await prisma.camera.findMany({
    where: {
      enabled: true,
      cameraProviderType: CameraProviderType.SIMULATOR,
    },
  });

  let started = 0;
  for (const camera of cameras) {
    try {
      await manager.start(toCameraFactoryInput(camera));
      started += 1;
    } catch (error) {
      console.error("Camera runtime failed to start simulator", {
        cameraId: camera.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  console.log(`Camera runtime started ${started} simulator camera(s)`);
}

export async function stopCameraRuntime(): Promise<void> {
  await getCameraConnectionManager().shutdown();
}

export function toCameraFactoryInput(camera: {
  id: string;
  organizationId: string;
  siteId: string;
  weighbridgeId: string;
  name: string;
  cameraIdentifier: string;
  cameraProviderType: string;
  connectionType: string;
  enabled: boolean;
  snapshotUrl: string | null;
  streamUrl: string | null;
  simulatorScenario: string;
}): CameraFactoryInput {
  return {
    cameraId: camera.id,
    organizationId: camera.organizationId,
    siteId: camera.siteId,
    weighbridgeId: camera.weighbridgeId,
    name: camera.name,
    cameraIdentifier: camera.cameraIdentifier,
    cameraProviderType: camera.cameraProviderType as CameraFactoryInput["cameraProviderType"],
    connectionType: camera.connectionType as CameraFactoryInput["connectionType"],
    enabled: camera.enabled,
    simulatorScenario: isCameraSimulatorScenario(camera.simulatorScenario)
      ? (camera.simulatorScenario as CameraSimulatorScenario)
      : "HIGH_KNOWN",
    ...(camera.snapshotUrl ? { snapshotUrl: camera.snapshotUrl } : {}),
    ...(camera.streamUrl ? { streamUrl: camera.streamUrl } : {}),
  };
}

async function persistSnapshot(snapshot: ManagedCameraSnapshot): Promise<void> {
  try {
    await prisma.camera.update({
      where: { id: snapshot.cameraId },
      data: {
        lastStatus: snapshot.status as HardwareDeviceStatus,
        lastError: snapshot.lastError,
        ...(snapshot.lastCommunicationAt ? { lastCommunicationAt: new Date(snapshot.lastCommunicationAt) } : {}),
        ...(snapshot.lastFrameAt ? { lastFrameAt: new Date(snapshot.lastFrameAt) } : {}),
      },
    });
  } catch (error) {
    console.error("Failed to persist camera status", {
      cameraId: snapshot.cameraId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}
