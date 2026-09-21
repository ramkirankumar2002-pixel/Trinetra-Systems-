import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { ActorContext } from "../shared/actor.js";
import { toAuthenticatedUser, userAuthInclude } from "../auth/userMapper.js";
import type { AuthenticatedGateway } from "./types.js";

const EDGE_SERVICE_EMAIL = "edge.service@trinetra.local";

export async function actorFromGateway(
  gateway: AuthenticatedGateway,
  meta?: { ipAddress?: string | undefined; userAgent?: string | undefined },
): Promise<ActorContext> {
  const user = await prisma.user.findFirst({
    where: {
      organizationId: gateway.organizationId,
      email: EDGE_SERVICE_EMAIL,
      deletedAt: null,
    },
    include: userAuthInclude,
  });
  if (!user) {
    throw new HttpError(503, "Edge service account is not configured");
  }

  return {
    user: toAuthenticatedUser(user, `gateway:${gateway.id}`),
    ...(meta?.ipAddress === undefined ? {} : { ipAddress: meta.ipAddress }),
    ...(meta?.userAgent === undefined ? {} : { userAgent: meta.userAgent }),
  };
}

export function edgeSystemActor(organizationId: string): ActorContext {
  return {
    user: {
      id: "system:edge",
      fullName: "Edge Gateway runtime",
      email: "edge@system.local",
      isActive: true,
      organization: { id: organizationId, name: "System", slug: "system", status: "ACTIVE", kind: "CUSTOMER" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: [],
      organizationId,
      sessionId: "system:edge",
    },
  };
}
