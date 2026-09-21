import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { writeLog } from "../../lib/logger.js";
import {
  assertResolvedWebhookDestination,
  decryptSecret,
  nextWebhookRetryAt,
  shouldAbandonWebhook,
  signWebhookPayload,
} from "../../domain/integration/index.js";

export async function processDueWebhookDeliveries(now = new Date(), limit = 20): Promise<number> {
  const staleDeliveringBefore = new Date(now.getTime() - 2 * 60 * 1000);
  const due = await prisma.integrationWebhookDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextRetryAt: { lte: now } },
        { status: "DELIVERING", lastAttemptAt: { lte: staleDeliveringBefore } },
      ],
    },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
    include: {
      webhook: true,
      event: true,
    },
  });

  let processed = 0;
  for (const delivery of due) {
    if (delivery.webhook.status !== "ACTIVE") {
      await prisma.integrationWebhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "DISABLED", failureReason: "Webhook is no longer active" },
      });
      continue;
    }
    await attemptDelivery(delivery.id);
    processed += 1;
  }
  return processed;
}

export async function attemptDelivery(deliveryId: string): Promise<void> {
  const claimed = await prisma.integrationWebhookDelivery.updateMany({
    where: { id: deliveryId, status: { in: ["PENDING", "FAILED", "DELIVERING"] } },
    data: { status: "DELIVERING", lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) {
    return;
  }

  const delivery = await prisma.integrationWebhookDelivery.findFirst({
    where: { id: deliveryId },
    include: { webhook: true, event: true },
  });
  if (!delivery) {
    return;
  }

  const attemptCount = delivery.attemptCount + 1;
  try {
    const allowPrivate = env.nodeEnv !== "production";
    await assertResolvedWebhookDestination(delivery.webhook.url, allowPrivate);
    const secret = decryptSecret(delivery.webhook.secretCiphertext);
    const timestamp = String(Date.now());
    const body = JSON.stringify({
      id: delivery.event.id,
      type: delivery.event.eventType,
      createdAt: delivery.event.occurredAt.toISOString(),
      test: delivery.event.isTest,
      data: delivery.event.payload,
    });
    const signature = signWebhookPayload(secret, timestamp, delivery.event.id, body);
    const response = await fetch(delivery.webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trinetra-signature": signature,
        "x-trinetra-timestamp": timestamp,
        "x-trinetra-event-id": delivery.event.id,
        "x-trinetra-event-type": delivery.event.eventType,
        "x-trinetra-delivery-id": delivery.id,
        ...(delivery.event.correlationId ? { "x-correlation-id": delivery.event.correlationId } : {}),
      },
      body,
      signal: AbortSignal.timeout(env.integrationWebhookTimeoutMs),
      redirect: "error",
    });
    if (response.ok) {
      await prisma.integrationWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "DELIVERED",
          attemptCount,
          responseStatus: response.status,
          failureReason: null,
        },
      });
      return;
    }
    await markFailure(delivery.id, attemptCount, response.status, `HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook delivery failed";
    writeLog("warn", "integration_webhook_delivery_failed", {
      deliveryId: delivery.id,
      webhookId: delivery.webhookId,
    });
    await markFailure(delivery.id, attemptCount, null, message);
  }
}

async function markFailure(
  deliveryId: string,
  attemptCount: number,
  responseStatus: number | null,
  reason: string,
): Promise<void> {
  const nextRetry = nextWebhookRetryAt(attemptCount);
  await prisma.integrationWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      attemptCount,
      responseStatus,
      failureReason: reason.slice(0, 500),
      status: "FAILED",
      nextRetryAt:
        shouldAbandonWebhook(attemptCount) || !nextRetry
          ? new Date("9999-01-01T00:00:00.000Z")
          : nextRetry,
    },
  });
}
