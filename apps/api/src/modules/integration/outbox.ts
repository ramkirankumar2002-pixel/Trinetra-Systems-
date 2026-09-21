import type { Prisma } from "@prisma/client";
import { AUDIT_TO_WEBHOOK_EVENT, type WebhookEventType } from "../../domain/integration/index.js";
import { prisma } from "../../db/client.js";
import { sanitizeMetadata } from "./mapper.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

function siteIdFromMetadata(metadata: Prisma.InputJsonValue | undefined): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const siteId = (metadata as Record<string, unknown>).siteId;
  return typeof siteId === "string" && siteId !== "" ? siteId : null;
}

export async function enqueueFromAudit(
  input: {
    organizationId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue | undefined;
  },
  db: DbClient = prisma,
): Promise<void> {
  const eventType = AUDIT_TO_WEBHOOK_EVENT[input.action];
  if (!eventType) {
    return;
  }
  const siteId =
    siteIdFromMetadata(input.metadata) ?? (await resolveEntitySiteId(input.organizationId, input.entityType, input.entityId, db));
  await recordIntegrationEvent(
    {
      organizationId: input.organizationId,
      siteId,
      eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ...((sanitizeMetadata(input.metadata) as Record<string, unknown>) ?? {}),
      },
      isTest: false,
    },
    db,
  );
}

export async function recordIntegrationEvent(
  input: {
    organizationId: string;
    siteId?: string | null;
    eventType: WebhookEventType;
    entityType: string;
    entityId: string;
    payload: Prisma.InputJsonValue;
    isTest: boolean;
    correlationId?: string | null;
  },
  db: DbClient = prisma,
): Promise<{ eventId: string; deliveryIds: string[] }> {
  const event = await db.integrationOutboxEvent.create({
    data: {
      organizationId: input.organizationId,
      siteId: input.siteId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
      isTest: input.isTest,
      correlationId: input.correlationId ?? null,
    },
  });

  const webhooks = await db.integrationWebhook.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      eventTypes: { has: input.eventType },
      application: { status: "ACTIVE" },
    },
    select: { id: true, applicationId: true, application: { select: { siteIds: true } } },
  });

  const deliveryIds: string[] = [];
  for (const webhook of webhooks) {
    if (webhook.application.siteIds.length > 0) {
      if (!input.siteId || !webhook.application.siteIds.includes(input.siteId)) {
        continue;
      }
    }
    const delivery = await db.integrationWebhookDelivery.create({
      data: {
        organizationId: input.organizationId,
        applicationId: webhook.applicationId,
        webhookId: webhook.id,
        eventId: event.id,
        status: "PENDING",
        nextRetryAt: new Date(),
      },
      select: { id: true },
    });
    deliveryIds.push(delivery.id);
  }

  return { eventId: event.id, deliveryIds };
}

async function resolveEntitySiteId(
  organizationId: string,
  entityType: string,
  entityId: string,
  db: DbClient,
): Promise<string | null> {
  if (entityType !== "Transaction") {
    return null;
  }
  const transaction = await db.transaction.findFirst({
    where: { id: entityId, organizationId },
    select: { siteId: true },
  });
  return transaction?.siteId ?? null;
}
