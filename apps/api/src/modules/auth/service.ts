import { randomUUID } from "node:crypto";
import { prisma } from "../../db/client.js";
import { verifyPasswordOrDummy } from "../../lib/password.js";
import { HttpError } from "../../lib/httpError.js";
import {
  assertOrganizationAllowsLogin,
  organizationStatusOf,
} from "../../domain/tenancy/lifecycle.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { getSessionExpiry, hashAccessToken, signAccessToken } from "./session.js";
import type { PublicUser } from "./types.js";
import { toAuthenticatedUser, toPublicUser, userAuthInclude } from "./userMapper.js";
import { assertRequestedSite } from "../shared/siteScope.js";

const INVALID_LOGIN = "Invalid email or password";

type LoginContext = {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

export async function loginUser(
  email: string,
  password: string,
  context: LoginContext,
  organizationSlug?: string,
): Promise<{ user: PublicUser; token: string }> {
  const matches = await prisma.user.findMany({
    where: {
      email,
      deletedAt: null,
      ...(organizationSlug
        ? { organization: { slug: organizationSlug } }
        : {}),
    },
    include: userAuthInclude,
  });

  const user = matches.length === 1 ? matches[0] : undefined;
  const passwordMatches = await verifyPasswordOrDummy(password, user?.passwordHash ?? null);

  if (!user || !passwordMatches) {
    if (user) {
      await writeAudit({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        entityType: "User",
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: { reason: "invalid_password" },
      });
    }
    throw new HttpError(401, INVALID_LOGIN);
  }

  if (!user.isActive) {
    await writeAudit({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { reason: "inactive" },
    });
    throw new HttpError(401, INVALID_LOGIN);
  }

  try {
    assertOrganizationAllowsLogin(organizationStatusOf(user.organization.status));
  } catch (error) {
    await writeAudit({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: "User",
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      metadata: { reason: "organization_archived" },
    });
    throw error;
  }

  const session = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: `pending:${randomUUID()}`,
      expiresAt: getSessionExpiry(),
    },
  });

  const token = signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
    sessionId: session.id,
  });

  await prisma.refreshToken.update({
    where: { id: session.id },
    data: { tokenHash: hashAccessToken(token) },
  });

  await writeAudit({
    organizationId: user.organizationId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: "User",
    entityId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return {
    user: toPublicUser(user),
    token,
  };
}

export async function logoutUser(
  sessionId: string,
  context: LoginContext & { organizationId: string; userId: string },
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });

  await writeAudit({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: "User",
    entityId: context.userId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

export async function getUserBySession(sessionId: string, userId: string, organizationId?: string) {
  const session = await prisma.refreshToken.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.userId !== userId || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, "Not authenticated");
  }

  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
    },
    include: userAuthInclude,
  });

  if (!user || !user.isActive) {
    throw new HttpError(401, "Not authenticated");
  }

  if (organizationId && user.organizationId !== organizationId) {
    throw new HttpError(401, "Not authenticated");
  }

  assertOrganizationAllowsLogin(organizationStatusOf(user.organization.status));

  return user;
}

export async function switchActiveSite(
  userId: string,
  organizationId: string,
  siteId: string,
  context: LoginContext & { sessionId: string },
): Promise<PublicUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, organizationId, deletedAt: null },
    include: userAuthInclude,
  });
  if (!user || !user.isActive) {
    throw new HttpError(401, "Not authenticated");
  }

  await assertRequestedSite({ user: toAuthenticatedUser(user, context.sessionId) }, siteId);

  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId, deletedAt: null },
  });
  if (!site) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const previousSiteId = user.defaultSiteId;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { defaultSiteId: site.id },
    include: userAuthInclude,
  });

  await writeAudit({
    organizationId,
    actorUserId: user.id,
    action: AUDIT_ACTIONS.SITE_CONTEXT_CHANGED,
    entityType: "User",
    entityId: user.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: { fromSiteId: previousSiteId, toSiteId: site.id },
  });

  return toPublicUser(updated);
}
