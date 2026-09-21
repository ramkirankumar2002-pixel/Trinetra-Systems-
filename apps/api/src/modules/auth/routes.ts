import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import {
  requireDepartment,
  requireRole,
  requireSiteAccess,
} from "../../middleware/authorize.js";
import { loginRateLimit } from "../../middleware/loginRateLimit.js";
import { actorFromRequest } from "../shared/actor.js";
import { getClientIp, getUserAgent } from "./requestMeta.js";
import { logoutUser, loginUser, switchActiveSite } from "./service.js";
import { clearSessionCookie, setSessionCookie } from "./session.js";
import type { AuthedRequest } from "./types.js";
import { parseActiveSiteInput, parseLoginInput } from "./validators.js";
import { getOperationalContext } from "../tenancy/service.js";

export const authRouter = Router();

authRouter.post("/login", loginRateLimit, async (request, response, next) => {
  try {
    const input = parseLoginInput(request.body);
    const result = await loginUser(input.email, input.password, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    }, input.organizationSlug);
    setSessionCookie(response, result.token);
    response.status(200).json({ user: result.user });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", requireAuthentication, async (request, response, next) => {
  try {
    const auth = (request as AuthedRequest).auth;
    await logoutUser(auth.sessionId, {
      organizationId: auth.organizationId,
      userId: auth.id,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    clearSessionCookie(response);
    response.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuthentication, (request, response) => {
  const auth = (request as AuthedRequest).auth;
  const { organizationId: _organizationId, sessionId: _sessionId, ...user } = auth;
  response.status(200).json({ user });
});

authRouter.get("/context", requireAuthentication, async (request, response, next) => {
  try {
    const context = await getOperationalContext(actorFromRequest(request));
    response.status(200).json(context);
  } catch (error) {
    next(error);
  }
});

authRouter.patch("/context", requireAuthentication, async (request, response, next) => {
  try {
    const auth = (request as AuthedRequest).auth;
    const input = parseActiveSiteInput(request.body);
    const user = await switchActiveSite(auth.id, auth.organizationId, input.siteId, {
      sessionId: auth.sessionId,
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    response.status(200).json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/access/admin", requireAuthentication, requireRole("ADMIN"), (_request, response) => {
  response.status(200).json({ ok: true, area: "admin" });
});

authRouter.get(
  "/access/weighbridge",
  requireAuthentication,
  requireRole("WEIGHBRIDGE_OPERATOR"),
  (_request, response) => {
    response.status(200).json({ ok: true, area: "weighbridge" });
  },
);

authRouter.get(
  "/access/store-department",
  requireAuthentication,
  requireDepartment("STORE"),
  (_request, response) => {
    response.status(200).json({ ok: true, area: "store" });
  },
);

authRouter.get(
  "/access/sites/:siteId",
  requireAuthentication,
  requireSiteAccess,
  (_request, response) => {
    response.status(200).json({ ok: true, area: "site" });
  },
);
