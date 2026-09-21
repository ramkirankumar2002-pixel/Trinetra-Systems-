import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/httpError.js";
import type { AuthenticatedUser, AuthedRequest } from "../modules/auth/types.js";

export function requireRole(...roleCodes: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authedRequest = request as AuthedRequest;
    try {
      const auth = getAuth(authedRequest);
      if (!hasAnyRole(auth, roleCodes)) {
        throw new HttpError(403, "You do not have access to this resource");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(...permissionCodes: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authedRequest = request as AuthedRequest;
    try {
      const auth = getAuth(authedRequest);
      const allowed = permissionCodes.some((code) => auth.permissions.includes(code));
      if (!allowed) {
        throw new HttpError(403, "You do not have access to this resource");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireDepartment(...departmentCodes: string[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    const authedRequest = request as AuthedRequest;
    try {
      const auth = getAuth(authedRequest);
      if (hasAnyRole(auth, ["ADMIN"])) {
        next();
        return;
      }

      const departmentCode = auth.defaultDepartment?.code;
      if (!departmentCode || !departmentCodes.includes(departmentCode)) {
        throw new HttpError(403, "You do not have access to this department");
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSiteAccess(request: Request, _response: Response, next: NextFunction): void {
  try {
    const authedRequest = request as AuthedRequest;
    const auth = getAuth(authedRequest);
    const siteId = readRequestedSiteId(authedRequest);
    if (!siteId) {
      throw new HttpError(400, "A site is required");
    }

    if (!canAccessSite(auth, siteId)) {
      throw new HttpError(403, "You do not have access to this site");
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function assertSiteAccess(user: AuthenticatedUser, siteId: string): void {
  if (!canAccessSite(user, siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }
}

export function hasOrganizationWideSiteAccess(user: AuthenticatedUser): boolean {
  return user.roles.some((role) => role.site === null && !role.weighbridge);
}

export function canAccessSite(user: AuthenticatedUser, siteId: string): boolean {
  if (hasOrganizationWideSiteAccess(user)) {
    return true;
  }

  if (user.defaultSite?.id === siteId) {
    return true;
  }

  return user.roles.some((role) => role.site?.id === siteId);
}

export function accessibleWeighbridgeIds(user: AuthenticatedUser): string[] | null {
  if (hasOrganizationWideSiteAccess(user)) {
    return null;
  }

  const siteWide = user.roles.some((role) => role.site !== null && !role.weighbridge);
  if (siteWide) {
    return null;
  }

  return [
    ...new Set(
      user.roles
        .map((role) => role.weighbridge?.id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
}

export function canAccessWeighbridge(user: AuthenticatedUser, weighbridgeId: string, siteId?: string): boolean {
  if (siteId && !canAccessSite(user, siteId)) {
    return false;
  }

  const ids = accessibleWeighbridgeIds(user);
  if (ids === null) {
    return siteId ? canAccessSite(user, siteId) : true;
  }

  return ids.includes(weighbridgeId);
}

export function assertWeighbridgeAccess(user: AuthenticatedUser, weighbridgeId: string, siteId?: string): void {
  if (!canAccessWeighbridge(user, weighbridgeId, siteId)) {
    throw new HttpError(403, "You do not have access to this weighbridge");
  }
}

function getAuth(request: AuthedRequest): AuthenticatedUser {
  if (!request.auth) {
    throw new HttpError(401, "Not authenticated");
  }

  return request.auth;
}

function hasAnyRole(user: AuthenticatedUser, roleCodes: string[]): boolean {
  return user.roles.some((role) => roleCodes.includes(role.code));
}

function readRequestedSiteId(request: AuthedRequest): string | undefined {
  const fromParams = request.params.siteId;
  if (typeof fromParams === "string" && fromParams !== "") {
    return fromParams;
  }

  const fromQuery = request.query.siteId;
  if (typeof fromQuery === "string" && fromQuery !== "") {
    return fromQuery;
  }

  if (typeof request.body === "object" && request.body !== null && "siteId" in request.body) {
    const value = request.body.siteId;
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }

  return undefined;
}
