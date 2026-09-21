import type { CookieOptions, Response } from "express";
import jwt from "jsonwebtoken";
import { env, isProduction } from "../../config/env.js";
import { isPlaceholderJwtSecret, jwtSecretIssue, sessionTtlSeconds } from "../../config/security.js";
import { sha256 } from "../../lib/crypto.js";
import { HttpError } from "../../lib/httpError.js";

const SESSION_SECONDS = sessionTtlSeconds(env.jwtExpiresIn, isProduction());
const SESSION_MS = SESSION_SECONDS * 1000;

type SessionClaims = {
  sub: string;
  org: string;
  jti: string;
};

export function getSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_MS);
}

export function signAccessToken(input: { userId: string; organizationId: string; sessionId: string }): string {
  const issue = jwtSecretIssue(env.jwtSecret, isProduction());
  if (issue || (isProduction() && isPlaceholderJwtSecret(env.jwtSecret))) {
    throw new HttpError(500, "Authentication is not configured");
  }

  return jwt.sign(
    {
      sub: input.userId,
      org: input.organizationId,
      jti: input.sessionId,
    },
    env.jwtSecret,
    {
      expiresIn: SESSION_SECONDS,
    },
  );
}

export function hashAccessToken(token: string): string {
  return sha256(token);
}

export function readAccessToken(token: string): SessionClaims {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, "Not authenticated");
  }

  if (typeof payload !== "object" || payload === null) {
    throw new HttpError(401, "Not authenticated");
  }

  const { sub, org, jti } = payload as Partial<SessionClaims>;
  if (typeof sub !== "string" || typeof org !== "string" || typeof jti !== "string") {
    throw new HttpError(401, "Not authenticated");
  }

  return { sub, org, jti };
}

export function setSessionCookie(response: Response, token: string): void {
  response.cookie(env.authCookieName, token, cookieOptions());
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(env.authCookieName, cookieOptions());
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS,
  };
}
