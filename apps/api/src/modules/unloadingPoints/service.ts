import { Prisma, UnloadingPointStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess, canAccessSite } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import {
  assignmentRuleInclude,
  toPublicAssignmentRule,
  toPublicUnloadingPoint,
  unloadingPointInclude,
  type PublicAssignmentRule,
  type PublicUnloadingPoint,
} from "./mapper.js";
import type { AssignmentRuleWriteInput, UnloadingPointWriteInput } from "./validators.js";

export async function listUnloadingPoints(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicUnloadingPoint[] }> {
  const siteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;
  if (siteId) {
    assertSiteAccess(actor.user, siteId);
  }

  const includeInactive = query.includeInactive === "true";
  const rows = await prisma.unloadingPoint.findMany({
    where: {
      organizationId: actor.user.organizationId,
      deletedAt: null,
      ...(siteId === undefined ? {} : { siteId }),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: unloadingPointInclude,
    orderBy: [{ site: { name: "asc" } }, { sortOrder: "asc" }, { code: "asc" }],
  });

  return {
    items: rows.filter((row) => canAccessSite(actor.user, row.siteId)).map(toPublicUnloadingPoint),
  };
}

export async function createUnloadingPoint(
  actor: ActorContext,
  input: UnloadingPointWriteInput,
): Promise<PublicUnloadingPoint> {
  assertSiteAccess(actor.user, input.siteId);
  await assertSiteInOrganization(actor.user.organizationId, input.siteId);

  try {
    const created = await prisma.unloadingPoint.create({
      data: {
        organizationId: actor.user.organizationId,
        siteId: input.siteId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        status: input.isActive ? input.status : UnloadingPointStatus.INACTIVE,
        isActive: input.isActive,
        allowedMaterialIds: input.allowedMaterialIds,
        sortOrder: input.sortOrder,
      },
      include: unloadingPointInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.UNLOADING_POINT_CREATED,
      entityType: "UnloadingPoint",
      entityId: created.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: created.code, siteId: created.siteId },
    });

    return toPublicUnloadingPoint(created);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "An unloading point with this code already exists at the site");
    }
    throw error;
  }
}

export async function updateUnloadingPoint(
  actor: ActorContext,
  id: string,
  input: Partial<UnloadingPointWriteInput>,
): Promise<PublicUnloadingPoint> {
  const existing = await loadPoint(actor, id);
  const isActive = input.isActive ?? existing.isActive;
  const status = !isActive
    ? UnloadingPointStatus.INACTIVE
    : input.status ?? (existing.status === UnloadingPointStatus.INACTIVE ? UnloadingPointStatus.AVAILABLE : existing.status);

  try {
    const updated = await prisma.unloadingPoint.update({
      where: { id: existing.id },
      data: {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description === "" ? null : input.description }),
        isActive,
        status,
        ...(input.allowedMaterialIds === undefined ? {} : { allowedMaterialIds: input.allowedMaterialIds }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      },
      include: unloadingPointInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.UNLOADING_POINT_UPDATED,
      entityType: "UnloadingPoint",
      entityId: updated.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: updated.code, status: updated.status },
    });

    return toPublicUnloadingPoint(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "An unloading point with this code already exists at the site");
    }
    throw error;
  }
}

export async function listAssignmentRules(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<{ items: PublicAssignmentRule[] }> {
  const siteId = typeof query.siteId === "string" && query.siteId !== "" ? query.siteId : undefined;
  if (siteId) {
    assertSiteAccess(actor.user, siteId);
  }

  const rows = await prisma.unloadingPointAssignmentRule.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(siteId === undefined ? {} : { siteId }),
    },
    include: assignmentRuleInclude,
    orderBy: [{ site: { name: "asc" } }, { priority: "asc" }],
  });

  return {
    items: rows.filter((row) => canAccessSite(actor.user, row.siteId)).map(toPublicAssignmentRule),
  };
}

export async function createAssignmentRule(
  actor: ActorContext,
  input: AssignmentRuleWriteInput,
): Promise<PublicAssignmentRule> {
  assertSiteAccess(actor.user, input.siteId);
  await assertSiteInOrganization(actor.user.organizationId, input.siteId);
  const point = await loadPoint(actor, input.unloadingPointId);
  if (point.siteId !== input.siteId) {
    throw new HttpError(400, "Assignment rule site must match the unloading point site");
  }
  if (input.materialId) {
    const material = await prisma.material.findFirst({
      where: { id: input.materialId, organizationId: actor.user.organizationId, deletedAt: null },
    });
    if (!material) {
      throw new HttpError(400, "Material was not found");
    }
  }

  const created = await prisma.unloadingPointAssignmentRule.create({
    data: {
      organizationId: actor.user.organizationId,
      siteId: input.siteId,
      materialId: input.materialId ?? null,
      unloadingPointId: input.unloadingPointId,
      priority: input.priority,
      isActive: input.isActive,
    },
    include: assignmentRuleInclude,
  });

  return toPublicAssignmentRule(created);
}

export async function updateAssignmentRule(
  actor: ActorContext,
  id: string,
  input: Partial<AssignmentRuleWriteInput>,
): Promise<PublicAssignmentRule> {
  const existing = await prisma.unloadingPointAssignmentRule.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });
  if (!existing) {
    throw new HttpError(404, "Assignment rule not found");
  }
  assertSiteAccess(actor.user, existing.siteId);

  const updated = await prisma.unloadingPointAssignmentRule.update({
    where: { id: existing.id },
    data: {
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.materialId === undefined ? {} : { materialId: input.materialId }),
    },
    include: assignmentRuleInclude,
  });

  return toPublicAssignmentRule(updated);
}

export async function deleteAssignmentRule(actor: ActorContext, id: string): Promise<void> {
  const existing = await prisma.unloadingPointAssignmentRule.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });
  if (!existing) {
    throw new HttpError(404, "Assignment rule not found");
  }
  assertSiteAccess(actor.user, existing.siteId);
  await prisma.unloadingPointAssignmentRule.delete({ where: { id: existing.id } });
}

export async function listAccessibleSites(
  actor: ActorContext,
): Promise<{ items: Array<{ id: string; code: string; name: string; status: string; timezone: string }> }> {
  const rows = await prisma.site.findMany({
    where: { organizationId: actor.user.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true, status: true, timezone: true },
    orderBy: { name: "asc" },
  });
  return { items: rows.filter((site) => canAccessSite(actor.user, site.id)) };
}

async function loadPoint(actor: ActorContext, id: string) {
  const point = await prisma.unloadingPoint.findFirst({
    where: { id, organizationId: actor.user.organizationId, deletedAt: null },
    include: unloadingPointInclude,
  });
  if (!point) {
    throw new HttpError(404, "Unloading point not found");
  }
  assertSiteAccess(actor.user, point.siteId);
  return point;
}

async function assertSiteInOrganization(organizationId: string, siteId: string): Promise<void> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId, deletedAt: null },
  });
  if (!site) {
    throw new HttpError(400, "Site was not found");
  }
}
