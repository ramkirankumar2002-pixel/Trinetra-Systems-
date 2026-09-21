import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { IntegrationActor } from "./types.js";
import { parseListQuery } from "./validators.js";

export async function listExternalReferences(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const entityType = typeof query.entityType === "string" ? query.entityType : "";
  const where: Prisma.IntegrationExternalReferenceWhereInput = {
    organizationId: actor.user.organizationId,
    applicationId: actor.integration.applicationId,
    ...(entityType ? { entityType } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.integrationExternalReference.count({ where }),
    prisma.integrationExternalReference.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: items.map(toPublicReference),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}

export async function createExternalReference(
  actor: IntegrationActor,
  input: {
    entityType: string;
    entityId: string;
    externalType: "ERP_TRANSACTION" | "PURCHASE_ORDER" | "DELIVERY_REFERENCE" | "SUPPLIER" | "CUSTOM";
    externalId: string;
  },
) {
  await assertEntityExists(actor, input.entityType, input.entityId);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const reference = await tx.integrationExternalReference.create({
        data: {
          organizationId: actor.user.organizationId,
          applicationId: actor.integration.applicationId,
          entityType: input.entityType,
          entityId: input.entityId,
          externalType: input.externalType,
          externalId: input.externalId,
        },
      });
      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.INTEGRATION_WRITE,
          entityType: "IntegrationExternalReference",
          entityId: reference.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            applicationId: actor.integration.applicationId,
            entityType: input.entityType,
            entityId: input.entityId,
            externalType: input.externalType,
          },
        },
        tx,
      );
      return reference;
    });
    return { reference: toPublicReference(created) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "This external reference already exists for the integration");
    }
    throw error;
  }
}

async function assertEntityExists(actor: IntegrationActor, entityType: string, entityId: string): Promise<void> {
  if (entityType === "Transaction") {
    if (!actor.integration.scopes.includes("TRANSACTIONS_WRITE")) {
      throw new HttpError(403, "This integration does not have the required scope");
    }
    const transaction = await prisma.transaction.findFirst({
      where: { id: entityId, organizationId: actor.user.organizationId },
      select: { id: true, siteId: true },
    });
    if (!transaction) {
      throw new HttpError(404, "Transaction not found");
    }
    return;
  }
  if (entityType === "Vehicle") {
    if (!actor.integration.scopes.includes("VEHICLES_WRITE")) {
      throw new HttpError(403, "This integration does not have the required scope");
    }
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: entityId, organizationId: actor.user.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new HttpError(404, "Vehicle not found");
    }
    return;
  }
  throw new HttpError(400, "External references are only supported for Transaction and Vehicle records");
}

function toPublicReference(record: {
  id: string;
  entityType: string;
  entityId: string;
  externalType: string;
  externalId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    entityType: record.entityType,
    entityId: record.entityId,
    externalType: record.externalType,
    externalId: record.externalId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
