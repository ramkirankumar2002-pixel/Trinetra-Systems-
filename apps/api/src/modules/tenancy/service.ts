import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite, canAccessWeighbridge } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import type { PublicUser } from "../auth/types.js";

export type PublicTenantSite = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  timezone: string;
  operationMode: string;
};

export type OperationalContext = {
  organization: PublicUser["organization"];
  activeSite: PublicUser["defaultSite"];
  sites: PublicTenantSite[];
  departments: Array<{ id: string; code: string; name: string }>;
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string; isActive: boolean }>;
  permissions: string[];
};

export type OrganizationDirectory = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    kind: "DEMO" | "CUSTOMER";
  };
  sites: Array<{
    id: string;
    code: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    timezone: string;
    operationMode: string;
    weighbridges: Array<{ id: string; code: string; name: string; isActive: boolean }>;
    gateways: Array<{ id: string; code: string; name: string; enabled: boolean }>;
    cameras: Array<{ id: string; name: string; purpose: string; enabled: boolean }>;
  }>;
  departments: Array<{ id: string; code: string; name: string }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    defaultSite: { id: string; code: string; name: string } | null;
    roles: Array<{
      code: string;
      name: string;
      site: { id: string; code: string; name: string } | null;
      weighbridge: { id: string; code: string; name: string } | null;
    }>;
  }>;
};

export async function getOperationalContext(actor: ActorContext): Promise<OperationalContext> {
  const [sites, departments, weighbridges] = await Promise.all([
    prisma.site.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true, status: true, timezone: true, operationMode: true },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.weighbridge.findMany({
      where: { organizationId: actor.user.organizationId },
      select: { id: true, code: true, name: true, siteId: true, isActive: true },
      orderBy: [{ code: "asc" }],
    }),
  ]);

  return {
    organization: actor.user.organization,
    activeSite: actor.user.defaultSite,
    sites: sites.filter((site) => canAccessSite(actor.user, site.id)),
    departments,
    weighbridges: weighbridges.filter((row) => canAccessWeighbridge(actor.user, row.id, row.siteId)),
    permissions: actor.user.permissions,
  };
}

export async function getOrganizationDirectory(actor: ActorContext): Promise<OrganizationDirectory> {
  const organization = await prisma.organization.findFirst({
    where: { id: actor.user.organizationId },
    select: { id: true, name: true, slug: true, status: true, kind: true },
  });
  if (!organization) {
    throw new HttpError(404, "Organization not found");
  }

  const [sites, departments, users] = await Promise.all([
    prisma.site.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        timezone: true,
        operationMode: true,
        weighbridges: { select: { id: true, code: true, name: true, isActive: true }, orderBy: { code: "asc" } },
        edgeGateways: { select: { id: true, code: true, name: true, enabled: true }, orderBy: { code: "asc" } },
        cameras: { select: { id: true, name: true, purpose: true, enabled: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        isActive: true,
        defaultSite: { select: { id: true, code: true, name: true } },
        userRoles: {
          select: {
            role: { select: { code: true, name: true } },
            site: { select: { id: true, code: true, name: true } },
            weighbridge: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { fullName: "asc" },
    }),
  ]);

  const visibleSites = sites.filter((site) => canAccessSite(actor.user, site.id));

  return {
    organization,
    sites: visibleSites.map((site) => ({
      id: site.id,
      code: site.code,
      name: site.name,
      status: site.status,
      timezone: site.timezone,
      operationMode: site.operationMode,
      weighbridges: site.weighbridges.filter((row) => canAccessWeighbridge(actor.user, row.id, site.id)),
      gateways: site.edgeGateways,
      cameras: site.cameras,
    })),
    departments,
    users: users
      .filter((row) => {
        if (canAccessSite(actor.user, row.defaultSite?.id ?? "")) {
          return true;
        }
        return row.userRoles.some((assignment) => assignment.site === null || (assignment.site && canAccessSite(actor.user, assignment.site.id)));
      })
      .map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        isActive: row.isActive,
        defaultSite: row.defaultSite,
        roles: row.userRoles.map((assignment) => ({
          code: assignment.role.code,
          name: assignment.role.name,
          site: assignment.site,
          weighbridge: assignment.weighbridge,
        })),
      })),
  };
}

export async function updateOrganizationStatus(
  actor: ActorContext,
  status: "ACTIVE" | "SUSPENDED",
): Promise<{ id: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" }> {
  const existing = await prisma.organization.findFirst({
    where: { id: actor.user.organizationId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new HttpError(404, "Organization not found");
  }

  const updated = await prisma.organization.update({
    where: { id: existing.id },
    data: { status },
    select: { id: true, status: true },
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.ORGANIZATION_STATUS_CHANGED,
    entityType: "Organization",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { from: existing.status, to: status },
  });

  return updated;
}

export async function updateSiteStatus(
  actor: ActorContext,
  siteId: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<PublicTenantSite> {
  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: actor.user.organizationId, deletedAt: null },
  });
  if (!site) {
    throw new HttpError(404, "Site not found");
  }
  if (!canAccessSite(actor.user, site.id)) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const updated = await prisma.site.update({
    where: { id: site.id },
    data: { status },
    select: { id: true, code: true, name: true, status: true, timezone: true, operationMode: true },
  });

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.SITE_STATUS_CHANGED,
    entityType: "Site",
    entityId: updated.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { from: site.status, to: status },
  });

  return updated;
}
