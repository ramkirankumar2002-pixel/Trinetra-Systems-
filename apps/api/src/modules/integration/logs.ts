import { prisma } from "../../db/client.js";
import type { ActorContext } from "../shared/actor.js";
import { parseListQuery } from "./validators.js";

export async function listUsage(actor: ActorContext, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const applicationId = typeof query.applicationId === "string" ? query.applicationId : "";
  const where = {
    organizationId: actor.user.organizationId,
    ...(applicationId ? { applicationId } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.integrationRequestLog.count({ where }),
    prisma.integrationRequestLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
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
  ]);
  return {
    items: items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    })),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}
