import type { CameraSimulatorScenario } from "../../../domain/cameraConfig.js";
import { BaseCameraProvider } from "../baseProvider.js";
import { simulatedPngFrame } from "../simulatedFrame.js";
import type { CameraFactoryInput, CameraFrame } from "../types.js";

export class SimulatorCameraProvider extends BaseCameraProvider {
  private readonly scenario: CameraSimulatorScenario;

  constructor(private readonly input: CameraFactoryInput) {
    super(input.cameraId, input.weighbridgeId);
    this.scenario = input.simulatorScenario;
  }

  async initialize(): Promise<void> {
    if (!this.input.enabled) {
      this.status = "DISABLED";
      this.lastError = "Camera is disabled";
      return;
    }
    this.markConnected();
  }

  async captureFrame(): Promise<CameraFrame> {
    if (this.status === "DISABLED") {
      throw new Error("Camera is disabled");
    }
    if (this.status !== "CONNECTED") {
      await this.initialize();
    }
    if (this.status !== "CONNECTED") {
      throw new Error(this.lastError ?? "Simulator camera is not connected");
    }

    this.markFrame();
    return {
      cameraId: this.cameraId,
      weighbridgeId: this.weighbridgeId,
      capturedAt: new Date().toISOString(),
      mimeType: "image/png",
      bytes: simulatedPngFrame(),
      source: "SIMULATED",
      scenario: this.scenario,
      width: 1,
      height: 1,
    };
  }
}
