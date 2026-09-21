import type { Prisma } from "@prisma/client";

export const applicationInclude = {
  createdBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { credentials: true, webhooks: true } },
} as const;

export type ApplicationRecord = Prisma.IntegrationApplicationGetPayload<{ include: typeof applicationInclude }>;

export function toPublicApplication(record: ApplicationRecord) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    environment: record.environment,
    scopes: record.scopes,
    siteIds: record.siteIds,
    requestsPerMinute: record.requestsPerMinute,
    requestsPerHour: record.requestsPerHour,
    createdBy: record.createdBy,
    credentialCount: record._count.credentials,
    webhookCount: record._count.webhooks,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toPublicCredential(record: {
  id: string;
  clientId: string;
  secretPrefix: string;
  status: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  applicationId: string;
}) {
  return {
    id: record.id,
    applicationId: record.applicationId,
    clientId: record.clientId,
    secretPrefix: record.secretPrefix,
    status: record.status,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toPublicWebhook(record: {
  id: string;
  applicationId: string;
  url: string;
  status: string;
  eventTypes: string[];
  secretPrefix: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    applicationId: record.applicationId,
    url: record.url,
    status: record.status,
    eventTypes: record.eventTypes,
    secretPrefix: record.secretPrefix,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toPublicDelivery(record: {
  id: string;
  webhookId: string;
  eventId: string;
  status: string;
  attemptCount: number;
  responseStatus: number | null;
  lastAttemptAt: Date | null;
  nextRetryAt: Date;
  failureReason: string | null;
  createdAt: Date;
  event: { eventType: string; isTest: boolean; entityType: string; entityId: string };
  webhook: { url: string };
}) {
  return {
    id: record.id,
    webhookId: record.webhookId,
    eventId: record.eventId,
    eventType: record.event.eventType,
    isTest: record.event.isTest,
    entityType: record.event.entityType,
    entityId: record.event.entityId,
    destination: record.webhook.url,
    status: record.status,
    attemptCount: record.attemptCount,
    responseStatus: record.responseStatus,
    lastAttemptAt: record.lastAttemptAt?.toISOString() ?? null,
    nextRetryAt: record.nextRetryAt.toISOString(),
    failureReason: record.failureReason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function sanitizeMetadata(value: unknown): Prisma.InputJsonValue {
  if (value === null || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (/secret|password|token|authorization|credential|cipher/i.test(key)) {
      continue;
    }
    if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean" || entry === null) {
      result[key] = entry;
    }
  }
  return result as Prisma.InputJsonValue;
}
