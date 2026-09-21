import { prisma } from "../../db/client.js";
import type { ActorContext } from "../shared/actor.js";

export async function integrationOverview(actor: ActorContext) {
  const organizationId = actor.user.organizationId;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    activeIntegrations,
    suspendedIntegrations,
    requestCount24h,
    failedDeliveries,
    expiringCredentials,
    recentLogs,
    recentDeliveries,
  ] = await Promise.all([
    prisma.integrationApplication.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.integrationApplication.count({ where: { organizationId, status: "SUSPENDED" } }),
    prisma.integrationRequestLog.count({ where: { organizationId, createdAt: { gte: since } } }),
    prisma.integrationWebhookDelivery.count({
      where: { organizationId, status: "FAILED", nextRetryAt: { gte: new Date("9000-01-01T00:00:00.000Z") } },
    }),
    prisma.integrationCredential.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        expiresAt: { not: null, lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, clientId: true, secretPrefix: true, expiresAt: true, applicationId: true },
      take: 20,
      orderBy: { expiresAt: "asc" },
    }),
    prisma.integrationRequestLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        applicationId: true,
        method: true,
        path: true,
        statusCode: true,
        durationMs: true,
        requestId: true,
        rateLimited: true,
        createdAt: true,
      },
    }),
    prisma.integrationWebhookDelivery.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { event: true, webhook: { select: { url: true } } },
    }),
  ]);

  return {
    kpis: {
      activeIntegrations,
      suspendedIntegrations,
      requestCount24h,
      failedDeliveries,
    },
    expiringCredentials: expiringCredentials.map((item) => ({
      id: item.id,
      applicationId: item.applicationId,
      clientId: item.clientId,
      secretPrefix: item.secretPrefix,
      expiresAt: item.expiresAt?.toISOString() ?? null,
    })),
    recentActivity: recentLogs.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    recentDeliveries: recentDeliveries.map((item) => ({
      id: item.id,
      webhookId: item.webhookId,
      eventType: item.event.eventType,
      isTest: item.event.isTest,
      destination: item.webhook.url,
      status: item.status,
      attemptCount: item.attemptCount,
      responseStatus: item.responseStatus,
      failureReason: item.failureReason,
      createdAt: item.createdAt.toISOString(),
      lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
    })),
  };
}
