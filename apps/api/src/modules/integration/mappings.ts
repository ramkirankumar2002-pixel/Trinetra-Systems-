import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { TRINETRA_MAPPING_FIELDS } from "../../domain/integration/index.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { loadApplication } from "./applications.js";

export async function listFieldMappings(actor: ActorContext, applicationId: string) {
  const application = await loadApplication(actor, applicationId);
  const items = await prisma.integrationFieldMapping.findMany({
    where: { applicationId: application.id, organizationId: actor.user.organizationId },
    orderBy: { externalField: "asc" },
  });
  return {
    items: items.map(toPublicMapping),
    trinetraFields: [...TRINETRA_MAPPING_FIELDS],
  };
}

export async function upsertFieldMapping(
  actor: ActorContext,
  applicationId: string,
  input: { externalField: string; trinetraField: string; notes?: string | undefined },
) {
  const application = await loadApplication(actor, applicationId);
  const mapping = await prisma.$transaction(async (tx) => {
    const saved = await tx.integrationFieldMapping.upsert({
      where: {
        organizationId_applicationId_externalField: {
          organizationId: actor.user.organizationId,
          applicationId: application.id,
          externalField: input.externalField,
        },
      },
      create: {
        organizationId: actor.user.organizationId,
        applicationId: application.id,
        externalField: input.externalField,
        trinetraField: input.trinetraField,
        notes: input.notes ?? null,
      },
      update: {
        trinetraField: input.trinetraField,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_UPDATED,
        entityType: "IntegrationFieldMapping",
        entityId: saved.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { externalField: saved.externalField, trinetraField: saved.trinetraField },
      },
      tx,
    );
    return saved;
  });
  return { mapping: toPublicMapping(mapping) };
}

export async function deleteFieldMapping(actor: ActorContext, mappingId: string) {
  const existing = await prisma.integrationFieldMapping.findFirst({
    where: { id: mappingId, organizationId: actor.user.organizationId },
  });
  if (!existing) {
    throw new HttpError(404, "Field mapping not found");
  }
  await prisma.integrationFieldMapping.delete({ where: { id: existing.id } });
  return { deleted: true };
}

function toPublicMapping(record: {
  id: string;
  applicationId: string;
  externalField: string;
  trinetraField: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    applicationId: record.applicationId,
    externalField: record.externalField,
    trinetraField: record.trinetraField,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function applyFieldMapping(
  mappings: Array<{ externalField: string; trinetraField: string }>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const mapping of mappings) {
    if (mapping.externalField in payload) {
      mapped[mapping.trinetraField] = payload[mapping.externalField];
    }
  }
  return mapped;
}
