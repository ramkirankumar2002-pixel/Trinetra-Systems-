import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { assertApplicationSites } from "./actor.js";
import { applicationInclude, toPublicApplication } from "./mapper.js";
import { parseListQuery, type CreateApplicationInput, type UpdateApplicationInput } from "./validators.js";

export async function listApplications(actor: ActorContext, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const where: Prisma.IntegrationApplicationWhereInput = {
    organizationId: actor.user.organizationId,
    ...(parsed.status ? { status: parsed.status as never } : {}),
    ...(parsed.q
      ? { OR: [{ name: { contains: parsed.q, mode: "insensitive" } }, { description: { contains: parsed.q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.integrationApplication.count({ where }),
    prisma.integrationApplication.findMany({
      where,
      include: applicationInclude,
      orderBy: { createdAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: items.map(toPublicApplication),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}

export async function getApplication(actor: ActorContext, id: string) {
  return { application: toPublicApplication(await loadApplication(actor, id)) };
}

export async function createApplication(actor: ActorContext, input: CreateApplicationInput) {
  await assertApplicationSites(actor.user.organizationId, input.siteIds);
  const created = await prisma.$transaction(async (tx) => {
    const application = await tx.integrationApplication.create({
      data: {
        organizationId: actor.user.organizationId,
        name: input.name,
        description: input.description ?? null,
        environment: input.environment,
        scopes: input.scopes,
        siteIds: input.siteIds,
        requestsPerMinute: input.requestsPerMinute ?? 60,
        requestsPerHour: input.requestsPerHour ?? 1200,
        createdByUserId: actor.user.id,
      },
      include: applicationInclude,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_CREATED,
        entityType: "IntegrationApplication",
        entityId: application.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { name: application.name, environment: application.environment, scopes: application.scopes },
      },
      tx,
    );
    return application;
  });
  return { application: toPublicApplication(created) };
}

export async function updateApplication(actor: ActorContext, id: string, input: UpdateApplicationInput) {
  const existing = await loadApplication(actor, id);
  if (input.siteIds) {
    await assertApplicationSites(actor.user.organizationId, input.siteIds);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const application = await tx.integrationApplication.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
        ...(input.siteIds !== undefined ? { siteIds: input.siteIds } : {}),
        ...(input.requestsPerMinute !== undefined ? { requestsPerMinute: input.requestsPerMinute } : {}),
        ...(input.requestsPerHour !== undefined ? { requestsPerHour: input.requestsPerHour } : {}),
      },
      include: applicationInclude,
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action:
          input.status === "SUSPENDED"
            ? AUDIT_ACTIONS.INTEGRATION_SUSPENDED
            : input.status === "REVOKED"
              ? AUDIT_ACTIONS.INTEGRATION_REVOKED
              : AUDIT_ACTIONS.INTEGRATION_UPDATED,
        entityType: "IntegrationApplication",
        entityId: application.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { status: application.status },
      },
      tx,
    );
    return application;
  });
  return { application: toPublicApplication(updated) };
}

export async function loadApplication(actor: ActorContext, id: string) {
  const application = await prisma.integrationApplication.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: applicationInclude,
  });
  if (!application) {
    throw new HttpError(404, "Integration application not found");
  }
  return application;
}
