import type { Request } from "express";
import { getClientIp, getUserAgent } from "../auth/requestMeta.js";
import type { AuthenticatedUser, AuthedRequest } from "../auth/types.js";

export type ActorContext = {
  user: AuthenticatedUser;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
};

export function actorFromRequest(request: Request): ActorContext {
  const auth = (request as AuthedRequest).auth;
  return {
    user: auth,
    ipAddress: getClientIp(request),
    userAgent: getUserAgent(request),
  };
}
