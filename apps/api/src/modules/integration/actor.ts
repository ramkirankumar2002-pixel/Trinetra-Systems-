import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { scopeToInternalPermissions } from "../../domain/integration/index.js";
import type { AuthenticatedUser } from "../auth/types.js";
import type { ActorContext } from "../shared/actor.js";
import type { IntegrationAuth, IntegrationActor } from "./types.js";

export function actorFromIntegration(auth: IntegrationAuth, ipAddress?: string, userAgent?: string): IntegrationActor {
  const user: AuthenticatedUser = {
    id: auth.createdByUserId,
    fullName: auth.applicationName,
    email: `${auth.clientId}@integration.local`,
    isActive: true,
    organization: {
      id: auth.organizationId,
      name: auth.organizationName,
      slug: auth.organizationSlug,
      status: auth.organizationStatus,
      kind: auth.organizationKind,
    },
    defaultDepartment: null,
    defaultSite: auth.siteIds[0] ? { id: auth.siteIds[0], code: "", name: "" } : null,
    roles:
      auth.siteIds.length === 0
        ? [{ id: auth.applicationId, code: "INTEGRATION", name: auth.applicationName, site: null }]
        : auth.siteIds.map((siteId) => ({
            id: `${auth.applicationId}:${siteId}`,
            code: "INTEGRATION",
            name: auth.applicationName,
            site: { id: siteId, code: "", name: "" },
          })),
    permissions: scopeToInternalPermissions(auth.scopes),
    organizationId: auth.organizationId,
    sessionId: auth.credentialId,
  };

  const actor: ActorContext = { user, ipAddress, userAgent };
  return { ...actor, integration: auth };
}

export async function assertApplicationSites(organizationId: string, siteIds: string[]): Promise<void> {
  if (siteIds.length === 0) {
    return;
  }
  const sites = await prisma.site.findMany({
    where: { organizationId, id: { in: siteIds }, deletedAt: null },
    select: { id: true },
  });
  if (sites.length !== siteIds.length) {
    throw new HttpError(400, "One or more sites do not belong to this organization");
  }
}
