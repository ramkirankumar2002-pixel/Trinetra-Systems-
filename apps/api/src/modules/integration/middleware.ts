import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { getClientIp, getUserAgent } from "../auth/requestMeta.js";
import { getRequestId } from "../../lib/requestId.js";
import { hashIntegrationSecret, isIntegrationSecretFormat, type IntegrationScope } from "../../domain/integration/index.js";
import { assertOrganizationOperational, canLoginToOrganization, organizationStatusOf } from "../../domain/tenancy/lifecycle.js";
import { actorFromIntegration } from "./actor.js";
import { sendExternalError } from "./errors.js";
import type { AuthedRequest } from "../auth/types.js";
import type { IntegrationAuth, IntegrationRequest } from "./types.js";

type RateWindow = { minute: number; minuteCount: number; hour: number; hourCount: number };
const rateWindows = new Map<string, RateWindow>();

export function requireIntegrationAuth(request: Request, response: Response, next: NextFunction): void {
  void authenticate(request as IntegrationRequest, response, next);
}

export function requireIntegrationScope(...scopes: IntegrationScope[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    try {
      const auth = getIntegration(request as IntegrationRequest);
      if (!scopes.some((scope) => auth.scopes.includes(scope))) {
        throw new HttpError(403, "This integration does not have the required scope");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireIntegrationWrite(request: Request, _response: Response, next: NextFunction): void {
  try {
    const auth = getIntegration(request as IntegrationRequest);
    assertOrganizationOperational(auth.organizationStatus);
    if (auth.applicationStatus === "SUSPENDED") {
      throw new HttpError(403, "Integration is suspended");
    }
    next();
  } catch (error) {
    next(error);
  }
}

function getIntegration(request: IntegrationRequest): IntegrationAuth {
  if (!request.integration) {
    throw new HttpError(401, "Not authenticated");
  }
  return request.integration;
}

async function authenticate(request: IntegrationRequest, response: Response, next: NextFunction): Promise<void> {
  const started = Date.now();
  try {
    const secret = readSecret(request);
    if (!secret || !isIntegrationSecretFormat(secret)) {
      throw new HttpError(401, "Invalid integration credentials");
    }
    const credential = await prisma.integrationCredential.findFirst({
      where: { secretHash: hashIntegrationSecret(secret) },
      include: {
        application: true,
        organization: { select: { id: true, name: true, slug: true, status: true, kind: true } },
      },
    });
    if (!credential) {
      throw new HttpError(401, "Invalid integration credentials");
    }
    if (credential.status !== "ACTIVE") {
      throw new HttpError(401, "Credential is revoked");
    }
    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(401, "Credential has expired");
    }
    if (credential.application.status === "REVOKED") {
      throw new HttpError(401, "Integration is revoked");
    }
    if (credential.application.status === "SUSPENDED" && request.method !== "GET" && request.method !== "HEAD") {
      throw new HttpError(403, "Integration is suspended");
    }
    const orgStatus = organizationStatusOf(credential.organization.status);
    if (!canLoginToOrganization(orgStatus)) {
      throw new HttpError(401, "Organization is not available");
    }
    const auth: IntegrationAuth = {
      organizationId: credential.organizationId,
      organizationStatus: orgStatus,
      organizationName: credential.organization.name,
      organizationSlug: credential.organization.slug,
      organizationKind: credential.organization.kind,
      applicationId: credential.applicationId,
      applicationName: credential.application.name,
      applicationStatus: credential.application.status,
      environment: credential.application.environment,
      credentialId: credential.id,
      clientId: credential.clientId,
      scopes: credential.application.scopes as IntegrationAuth["scopes"],
      siteIds: credential.application.siteIds,
      createdByUserId: credential.application.createdByUserId,
      requestsPerMinute: credential.application.requestsPerMinute,
      requestsPerHour: credential.application.requestsPerHour,
    };
    const limited = consumeRateLimit(auth.credentialId, auth.requestsPerMinute, auth.requestsPerHour);
    response.setHeader("X-RateLimit-Limit", String(auth.requestsPerMinute));
    response.setHeader("X-RateLimit-Remaining", String(Math.max(0, limited.remaining)));
    response.setHeader("X-RateLimit-Reset", String(limited.resetEpoch));
    if (limited.limited) {
      response.setHeader("Retry-After", String(limited.retryAfterSeconds));
      request.integrationRateLimited = true;
      sendExternalError(request, response, 429, "Rate limit exceeded");
      recordRequest(request, auth, 429, Date.now() - started, true);
      return;
    }
    request.integration = auth;
    const actor = actorFromIntegration(auth, getClientIp(request), getUserAgent(request));
    (request as AuthedRequest).auth = actor.user;
    response.setHeader("X-Trinetra-Integration-Id", auth.applicationId);
    response.on("finish", () => {
      recordRequest(request, auth, response.statusCode, Date.now() - started, false);
    });
    void prisma.integrationCredential
      .update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    next();
  } catch (error) {
    next(error);
  }
}

function readSecret(request: Request): string | undefined {
  const apiKey = request.header("x-trinetra-api-key");
  if (typeof apiKey === "string" && apiKey.trim() !== "") {
    return apiKey.trim();
  }
  const header = request.header("authorization");
  if (!header) {
    return undefined;
  }
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return undefined;
  }
  return token.trim();
}

function consumeRateLimit(credentialId: string, rpm: number, rph: number): {
  limited: boolean;
  remaining: number;
  resetEpoch: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const hour = Math.floor(now / 3_600_000);
  const current = rateWindows.get(credentialId) ?? { minute, minuteCount: 0, hour, hourCount: 0 };
  if (current.minute !== minute) {
    current.minute = minute;
    current.minuteCount = 0;
  }
  if (current.hour !== hour) {
    current.hour = hour;
    current.hourCount = 0;
  }
  current.minuteCount += 1;
  current.hourCount += 1;
  rateWindows.set(credentialId, current);
  const limited = current.minuteCount > rpm || current.hourCount > rph;
  const remaining = Math.min(rpm - current.minuteCount, rph - current.hourCount);
  return {
    limited,
    remaining,
    resetEpoch: Math.floor(((minute + 1) * 60_000) / 1000),
    retryAfterSeconds: 60,
  };
}

function recordRequest(
  request: Request,
  auth: IntegrationAuth,
  statusCode: number,
  durationMs: number,
  rateLimited: boolean,
): void {
  const requestId = getRequestId(request) ?? "unknown";
  const path = request.path.slice(0, 300);
  void prisma.integrationRequestLog
    .create({
      data: {
        organizationId: auth.organizationId,
        applicationId: auth.applicationId,
        credentialId: auth.credentialId,
        method: request.method.slice(0, 12),
        path,
        statusCode,
        durationMs,
        requestId,
        rateLimited,
      },
    })
    .catch(() => undefined);
}

export function resetIntegrationRateLimitsForTests(): void {
  rateWindows.clear();
}
