import { prisma } from "../../db/client.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/httpError.js";
import {
  assertWebhookDestination,
  encryptSecret,
  generateWebhookSecret,
  secretPrefix,
} from "../../domain/integration/index.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { loadApplication } from "./applications.js";
import { attemptDelivery } from "./deliveries.js";
import { toPublicDelivery, toPublicWebhook } from "./mapper.js";
import { recordIntegrationEvent } from "./outbox.js";
import { parseListQuery } from "./validators.js";

const SECRET_WARNING = "Store this secret securely. It will not be shown again.";

export async function listWebhooks(actor: ActorContext, applicationId: string) {
  const application = await loadApplication(actor, applicationId);
  const items = await prisma.integrationWebhook.findMany({
    where: { applicationId: application.id, organizationId: actor.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return { items: items.map(toPublicWebhook) };
}

export async function createWebhook(
  actor: ActorContext,
  applicationId: string,
  input: { url: string; eventTypes: string[] },
) {
  const application = await loadApplication(actor, applicationId);
  if (application.status === "REVOKED") {
    throw new HttpError(400, "Cannot create webhooks for a revoked integration");
  }
  assertWebhookDestination(input.url, env.nodeEnv !== "production");
  const secret = generateWebhookSecret();
  const created = await prisma.$transaction(async (tx) => {
    const webhook = await tx.integrationWebhook.create({
      data: {
        organizationId: actor.user.organizationId,
        applicationId: application.id,
        url: input.url,
        eventTypes: input.eventTypes,
        secretCiphertext: encryptSecret(secret),
        secretPrefix: secretPrefix(secret),
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_WEBHOOK_CREATED,
        entityType: "IntegrationWebhook",
        entityId: webhook.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { applicationId: application.id, url: webhook.url, eventTypes: webhook.eventTypes },
      },
      tx,
    );
    return webhook;
  });
  return { webhook: toPublicWebhook(created), secret, warning: SECRET_WARNING };
}

export async function updateWebhook(
  actor: ActorContext,
  webhookId: string,
  input: { url?: string | undefined; eventTypes?: string[] | undefined; status?: "ACTIVE" | "DISABLED" | "REVOKED" | undefined },
) {
  const existing = await loadWebhook(actor, webhookId);
  if (input.url) {
    assertWebhookDestination(input.url, env.nodeEnv !== "production");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const webhook = await tx.integrationWebhook.update({
      where: { id: existing.id },
      data: {
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action:
          input.status === "DISABLED" || input.status === "REVOKED"
            ? AUDIT_ACTIONS.INTEGRATION_WEBHOOK_DISABLED
            : AUDIT_ACTIONS.INTEGRATION_WEBHOOK_UPDATED,
        entityType: "IntegrationWebhook",
        entityId: webhook.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { status: webhook.status },
      },
      tx,
    );
    return webhook;
  });
  return { webhook: toPublicWebhook(updated) };
}

export async function rotateWebhookSecret(actor: ActorContext, webhookId: string) {
  const existing = await loadWebhook(actor, webhookId);
  const secret = generateWebhookSecret();
  const updated = await prisma.$transaction(async (tx) => {
    const webhook = await tx.integrationWebhook.update({
      where: { id: existing.id },
      data: { secretCiphertext: encryptSecret(secret), secretPrefix: secretPrefix(secret) },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_WEBHOOK_SECRET_ROTATED,
        entityType: "IntegrationWebhook",
        entityId: webhook.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { secretPrefix: webhook.secretPrefix },
      },
      tx,
    );
    return webhook;
  });
  return { webhook: toPublicWebhook(updated), secret, warning: SECRET_WARNING };
}

export async function testWebhook(actor: ActorContext, webhookId: string) {
  const webhook = await loadWebhook(actor, webhookId);
  if (webhook.status !== "ACTIVE") {
    throw new HttpError(400, "Webhook must be active to send a test event");
  }
  const recorded = await recordIntegrationEvent({
    organizationId: actor.user.organizationId,
    eventType: "WEBHOOK_TEST",
    entityType: "IntegrationWebhook",
    entityId: webhook.id,
    payload: {
      test: true,
      message: "Trinetra webhook test event. This is not a production transaction.",
      webhookId: webhook.id,
    },
    isTest: true,
  });
  for (const deliveryId of recorded.deliveryIds) {
    await attemptDelivery(deliveryId);
  }
  const delivery = recorded.deliveryIds[0]
    ? await prisma.integrationWebhookDelivery.findFirst({
        where: { id: recorded.deliveryIds[0], organizationId: actor.user.organizationId },
        include: { event: true, webhook: { select: { url: true } } },
      })
    : null;
  return {
    eventId: recorded.eventId,
    test: true,
    delivery: delivery ? toPublicDelivery(delivery) : null,
  };
}

export async function listDeliveries(actor: ActorContext, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const webhookId = typeof query.webhookId === "string" ? query.webhookId : "";
  const applicationId = typeof query.applicationId === "string" ? query.applicationId : "";
  const where = {
    organizationId: actor.user.organizationId,
    ...(parsed.status ? { status: parsed.status as never } : {}),
    ...(webhookId ? { webhookId } : {}),
    ...(applicationId ? { applicationId } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.integrationWebhookDelivery.count({ where }),
    prisma.integrationWebhookDelivery.findMany({
      where,
      include: { event: true, webhook: { select: { url: true } } },
      orderBy: { createdAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: items.map(toPublicDelivery),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}

async function loadWebhook(actor: ActorContext, id: string) {
  const webhook = await prisma.integrationWebhook.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });
  if (!webhook) {
    throw new HttpError(404, "Webhook not found");
  }
  return webhook;
}
