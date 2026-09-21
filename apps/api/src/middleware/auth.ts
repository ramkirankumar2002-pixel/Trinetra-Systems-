import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../lib/httpError.js";
import { getUserBySession } from "../modules/auth/service.js";
import { readAccessToken } from "../modules/auth/session.js";
import type { AuthedRequest } from "../modules/auth/types.js";
import { toAuthenticatedUser } from "../modules/auth/userMapper.js";

export async function requireAuthentication(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readSessionToken(request);
    if (!token) {
      throw new HttpError(401, "Not authenticated");
    }

    const claims = readAccessToken(token);
    const user = await getUserBySession(claims.jti, claims.sub, claims.org);
    (request as AuthedRequest).auth = toAuthenticatedUser(user, claims.jti);
    next();
  } catch (error) {
    next(error);
  }
}

function readSessionToken(request: Request): string | undefined {
  const fromParser = request.cookies?.[env.authCookieName];
  if (typeof fromParser === "string" && fromParser !== "") {
    return fromParser;
  }

  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${env.authCookieName}=`;
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (!match) {
    return undefined;
  }

  const value = match.slice(prefix.length);
  return value === "" ? undefined : decodeURIComponent(value);
}
