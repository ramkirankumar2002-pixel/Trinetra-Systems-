import { BaseCameraProvider } from "../baseProvider.js";
import type { CameraFactoryInput, CameraFrame } from "../types.js";

const MESSAGE =
  "Physical camera connection is not enabled in this foundation. Configure the simulator. The system does not open RTSP, HTTP, or local camera connections automatically.";

export class UndeployedCameraProvider extends BaseCameraProvider {
  constructor(input: CameraFactoryInput) {
    super(input.cameraId, input.weighbridgeId);
  }

  async initialize(): Promise<void> {
    this.markError(MESSAGE);
  }

  async captureFrame(): Promise<CameraFrame> {
    this.markError(MESSAGE);
    throw new Error(MESSAGE);
  }
}
