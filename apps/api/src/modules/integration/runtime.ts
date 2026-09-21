import { env } from "../../config/env.js";
import { writeLog } from "../../lib/logger.js";
import { processDueWebhookDeliveries } from "./deliveries.js";

let timer: NodeJS.Timeout | undefined;

export function startIntegrationRuntime(): void {
  timer = setInterval(() => {
    void processDueWebhookDeliveries().catch((error: unknown) => {
      writeLog("error", "integration_webhook_worker_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    });
  }, env.integrationDeliveryIntervalMs);
  timer.unref();
}

export function stopIntegrationRuntime(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
