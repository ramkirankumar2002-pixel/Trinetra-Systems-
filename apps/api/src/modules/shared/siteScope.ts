import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import {
  accessibleWeighbridgeIds,
  assertSiteAccess,
  assertWeighbridgeAccess,
  hasOrganizationWideSiteAccess,
} from "../../middleware/authorize.js";
import type { ActorContext } from "./actor.js";

export function accessibleSiteIds(actor: ActorContext): string[] | null {
  if (hasOrganizationWideSiteAccess(actor.user)) {
    return null;
  }

  const siteIds = new Set<string>();
  if (actor.user.defaultSite) {
    siteIds.add(actor.user.defaultSite.id);
  }
  for (const role of actor.user.roles) {
    if (role.site) {
      siteIds.add(role.site.id);
    }
  }

  return [...siteIds];
}

export function accessibleSiteWhere(actor: ActorContext): Prisma.TransactionWhereInput {
  const siteIds = accessibleSiteIds(actor);
  if (siteIds === null) {
    return {};
  }

  return { siteId: { in: siteIds } };
}

export function accessibleWeighbridgeWhere(actor: ActorContext): Prisma.TransactionWhereInput {
  const ids = accessibleWeighbridgeIds(actor.user);
  if (ids === null) {
    return {};
  }

  return { weighbridgeId: { in: ids } };
}

export async function assertRequestedSite(actor: ActorContext, siteId: string): Promise<void> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: actor.user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  assertSiteAccess(actor.user, site.id);
}

export async function assertRequestedWeighbridge(
  actor: ActorContext,
  weighbridgeId: string,
  requestedSiteId?: string | undefined,
): Promise<void> {
  const weighbridge = await prisma.weighbridge.findFirst({
    where: { id: weighbridgeId, organizationId: actor.user.organizationId },
    select: { id: true, siteId: true },
  });
  if (!weighbridge) {
    throw new HttpError(404, "Weighbridge not found");
  }
  if (requestedSiteId && requestedSiteId !== weighbridge.siteId) {
    throw new HttpError(400, "Weighbridge does not belong to that site");
  }
  assertSiteAccess(actor.user, weighbridge.siteId);
  assertWeighbridgeAccess(actor.user, weighbridge.id, weighbridge.siteId);
}

export async function assertRequestedScope(
  actor: ActorContext,
  scope: { siteId?: string | undefined; weighbridgeId?: string | undefined },
): Promise<void> {
  if (scope.siteId) {
    await assertRequestedSite(actor, scope.siteId);
  }
  if (scope.weighbridgeId) {
    await assertRequestedWeighbridge(actor, scope.weighbridgeId, scope.siteId);
  }
}
