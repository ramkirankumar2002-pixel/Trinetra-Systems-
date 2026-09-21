import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { parsePagination } from "../../domain/pagination.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { materialInclude, toPublicMaterial, type PublicMaterial } from "./mapper.js";
import type { MaterialAssignmentInput, MaterialWriteInput } from "./validators.js";

export function listMaterialUnits(): Array<{ code: string; label: string }> {
  return env.materialUnits.map((code) => ({ code, label: code }));
}

export async function listMaterials(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicMaterial[]; page: number; pageSize: number; total: number }> {
  const pagination = parsePagination(query);
  const includeInactive = query.includeInactive === "true";
  const q = typeof query.q === "string" ? query.q.trim() : "";

  const where: Prisma.MaterialWhereInput = {
    organizationId: actor.user.organizationId,
    deletedAt: null,
  };

  if (!includeInactive) {
    where.isActive = true;
  }

  if (q !== "") {
    where.OR = [
      { code: { contains: q.toUpperCase() } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.material.count({ where }),
    prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: { name: "asc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  return {
    items: rows.map(toPublicMaterial),
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  };
}

export async function getMaterial(actor: ActorContext, id: string): Promise<PublicMaterial> {
  return toPublicMaterial(await loadMaterial(actor, id));
}

export async function createMaterial(actor: ActorContext, input: MaterialWriteInput): Promise<PublicMaterial> {
  try {
    const created = await prisma.material.create({
      data: {
        organizationId: actor.user.organizationId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        unitOfMeasure: input.unitOfMeasure,
        isActive: input.isActive,
      },
      include: materialInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.MATERIAL_CREATED,
      entityType: "Material",
      entityId: created.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: created.code, name: created.name, unitOfMeasure: created.unitOfMeasure },
    });

    return toPublicMaterial(created);
  } catch (error) {
    throw uniqueMaterialError(error);
  }
}

export async function updateMaterial(
  actor: ActorContext,
  id: string,
  input: Partial<MaterialWriteInput>,
): Promise<PublicMaterial> {
  const existing = await loadMaterial(actor, id);

  try {
    const updated = await prisma.material.update({
      where: { id: existing.id },
      data: {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.unitOfMeasure === undefined ? {} : { unitOfMeasure: input.unitOfMeasure }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      include: materialInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.MATERIAL_UPDATED,
      entityType: "Material",
      entityId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: updated.code },
    });

    return toPublicMaterial(updated);
  } catch (error) {
    throw uniqueMaterialError(error);
  }
}

export async function setMaterialActive(
  actor: ActorContext,
  id: string,
  isActive: boolean,
): Promise<PublicMaterial> {
  const existing = await loadMaterial(actor, id);
  const updated = await prisma.material.update({
    where: { id: existing.id },
    data: { isActive },
    include: materialInclude,
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: isActive ? AUDIT_ACTIONS.MATERIAL_ACTIVATED : AUDIT_ACTIONS.MATERIAL_DEACTIVATED,
    entityType: "Material",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { code: updated.code },
  });

  return toPublicMaterial(updated);
}

export async function assignMaterialWorkflow(
  actor: ActorContext,
  materialId: string,
  input: MaterialAssignmentInput,
): Promise<PublicMaterial> {
  const material = await loadMaterial(actor, materialId);
  const workflow = await prisma.workflowDefinition.findFirst({
    where: {
      id: input.workflowDefinitionId,
      organizationId: actor.user.organizationId,
      isActive: true,
    },
  });
  if (!workflow) {
    throw new HttpError(400, "Workflow was not found or is inactive");
  }

  if (input.siteId) {
    const site = await prisma.site.findFirst({
      where: { id: input.siteId, organizationId: actor.user.organizationId, deletedAt: null },
    });
    if (!site) {
      throw new HttpError(400, "Site was not found");
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await tx.materialWorkflowAssignment.findMany({
      where: {
        materialId: material.id,
        siteId: input.siteId ?? null,
        effectiveTo: null,
      },
    });

    for (const assignment of current) {
      await tx.materialWorkflowAssignment.update({
        where: { id: assignment.id },
        data: { effectiveTo: now },
      });
    }

    await tx.materialWorkflowAssignment.create({
      data: {
        organizationId: actor.user.organizationId,
        materialId: material.id,
        workflowDefinitionId: workflow.id,
        siteId: input.siteId ?? null,
        effectiveFrom: now,
      },
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.WORKFLOW_UPDATED,
        entityType: "Material",
        entityId: material.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          materialCode: material.code,
          workflowCode: workflow.code,
          siteId: input.siteId ?? null,
        },
      },
      tx,
    );
  });

  return getMaterial(actor, material.id);
}

export async function resolveMaterialWorkflow(
  organizationId: string,
  materialId: string,
  siteId: string,
  at: Date,
) {
  const assignments = await prisma.materialWorkflowAssignment.findMany({
    where: {
      organizationId,
      materialId,
      effectiveFrom: { lte: at },
      AND: [
        { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
        { OR: [{ siteId }, { siteId: null }] },
      ],
    },
    include: {
      workflowDefinition: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: { approvalDepartment: { select: { id: true, code: true, name: true } } },
          },
        },
      },
    },
    orderBy: { effectiveFrom: "desc" },
  });

  const scoped = assignments.filter((assignment) => assignment.siteId === siteId || assignment.siteId === null);
  return scoped.find((assignment) => assignment.siteId === siteId) ?? scoped.find((assignment) => assignment.siteId === null) ?? null;
}

async function loadMaterial(actor: ActorContext, id: string) {
  const material = await prisma.material.findFirst({
    where: { id, organizationId: actor.user.organizationId, deletedAt: null },
    include: materialInclude,
  });
  if (!material) {
    throw new HttpError(404, "Material not found");
  }
  return material;
}

function uniqueMaterialError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new HttpError(409, "A material with this code already exists");
  }
  return error;
}
