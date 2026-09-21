import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { APP_VERSION } from "./config/version.js";
import { validateReleaseConfigFromEnv } from "./config/productionValidator.js";
import { writeLog } from "./lib/logger.js";
import { startCameraRuntime, stopCameraRuntime } from "./integrations/cameras/runtime.js";
import { startHardwareRuntime, stopHardwareRuntime } from "./integrations/weighbridge/runtime.js";
import { getAnprProvider } from "./integrations/anpr/index.js";
import { startReliabilityRuntime, stopReliabilityRuntime } from "./modules/reliability/runtime.js";
import { startIntegrationRuntime, stopIntegrationRuntime } from "./modules/integration/runtime.js";

assertRuntimeSecurityConfig();

const app = createApp();

const server = app.listen(env.port, () => {
  writeLog("info", "api_listening", { port: env.port, nodeEnv: env.nodeEnv, version: APP_VERSION });
  void startHardwareRuntime().catch((error: unknown) => {
    writeLog("error", "hardware_runtime_start_failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
  });
  void getAnprProvider().initialize().catch((error: unknown) => {
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
});

function assertRuntimeSecurityConfig(): void {
  const checks = validateReleaseConfigFromEnv();
  const errors = checks.filter((item) => item.severity === "ERROR");
  if (errors.length > 0) {
    throw new Error(errors.map((item) => item.message).join("; "));
  }
  const warnings = checks.filter((item) => item.severity === "WARNING");
  if (warnings.length > 0) {
    writeLog("warn", "release_config_warnings", {
      count: warnings.length,
      codes: warnings.map((item) => item.code),
    });
  }
}

async function shutdown(): Promise<void> {
  stopReliabilityRuntime();
  stopIntegrationRuntime();
  await stopHardwareRuntime();
  await stopCameraRuntime();
  await getAnprProvider().shutdown();
  server.close();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
