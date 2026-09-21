import type { NextFunction, Request, Response } from "express";
import { assertOrganizationOperational, organizationStatusOf } from "../domain/tenancy/lifecycle.js";
import { HttpError } from "../lib/httpError.js";
import type { AuthedRequest } from "../modules/auth/types.js";
import type { GatewayRequest } from "../modules/edge/types.js";
import { actorFromRequest } from "../modules/shared/actor.js";
import { assertRequestedScope } from "../modules/shared/siteScope.js";

export function requireOperationalOrganization(request: Request, _response: Response, next: NextFunction): void {
  try {
    const auth = (request as AuthedRequest).auth;
    if (!auth) {
      throw new HttpError(401, "Not authenticated");
    }
    assertOrganizationOperational(organizationStatusOf(auth.organization.status));
    next();
  } catch (error) {
    next(error);
  }
}

export function skipReadsRequireOperationalOrganization(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    next();
    return;
  }
  requireOperationalOrganization(request, response, next);
}

export function requireOperationalGatewayOrganization(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    const gateway = (request as GatewayRequest).gateway;
    if (!gateway) {
      throw new HttpError(401, "Gateway is not authenticated");
    }
    assertOrganizationOperational(organizationStatusOf(gateway.organizationStatus));
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRequestedTenantScope(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const auth = (request as AuthedRequest).auth;
      if (!auth) {
        throw new HttpError(401, "Not authenticated");
      }
      await assertRequestedScope(actorFromRequest(request), {
        siteId: readOptionalId(request.query.siteId) ?? readBodyId(request.body, "siteId"),
        weighbridgeId: readOptionalId(request.query.weighbridgeId) ?? readBodyId(request.body, "weighbridgeId"),
      });
      next();
    } catch (error) {
      next(error);
    }
  })();
}

function readOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readBodyId(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[key];
  return readOptionalId(value);
}
