import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app.js";
import { writeLog } from "./lib/logger.js";
import { startCameraRuntime } from "./integrations/cameras/runtime.js";
import { startHardwareRuntime } from "./integrations/weighbridge/runtime.js";
import { getAnprProvider } from "./integrations/anpr/index.js";
import { startReliabilityRuntime } from "./modules/reliability/runtime.js";
import { startIntegrationRuntime } from "./modules/integration/runtime.js";

const app = createApp();

let runtimesStarted = false;

function startBackgroundRuntimes(): void {
  if (runtimesStarted) {
    return;
  }
  runtimesStarted = true;
  void startHardwareRuntime().catch((error: unknown) => {
    writeLog("error", "hardware_runtime_start_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  });
  void getAnprProvider()
    .initialize()
    .catch((error: unknown) => {
      writeLog("error", "anpr_provider_init_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  void startCameraRuntime().catch((error: unknown) => {
    writeLog("error", "camera_runtime_start_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  });
  startReliabilityRuntime();
  startIntegrationRuntime();
}

export const api = onRequest(
  {
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 120,
    concurrency: 20,
    invoker: "public",
    cors: false,
  },
  (request, response) => {
    startBackgroundRuntimes();
    app(request, response);
  },
);
