import { SimulatorCameraProvider } from "./adapters/simulatorAdapter.js";
import { UndeployedCameraProvider } from "./adapters/undeployedAdapter.js";
import type { CameraFactoryInput, ICameraProvider } from "./types.js";

export function createCameraProvider(input: CameraFactoryInput): ICameraProvider {
  if (input.cameraProviderType === "SIMULATOR") {
    return new SimulatorCameraProvider(input);
  }
  return new UndeployedCameraProvider(input);
}
