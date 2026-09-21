import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  acknowledgeOperationalAlert,
  getOperationalAlert,
  listOperationalAlerts,
  resolveOperationalAlert,
} from "./alerts.js";
import {
  getNotification,
  getUnreadCount,
  listNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationUnread,
  upsertNotificationPreference,
} from "./service.js";

export const notificationRouter = Router();
export const alertRouter = Router();

notificationRouter.use(requireAuthentication);
alertRouter.use(requireAuthentication);
alertRouter.use(requireRequestedTenantScope);

notificationRouter.get("/", async (request, response, next) => {
  try {
    const result = await listNotifications(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

notificationRouter.get("/unread-count", async (request, response, next) => {
  try {
    const result = await getUnreadCount(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

notificationRouter.get("/preferences", async (request, response, next) => {
  try {
    const result = await listNotificationPreferences(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

notificationRouter.patch("/preferences", async (request, response, next) => {
  try {
    const preference = await upsertNotificationPreference(
      actorFromRequest(request),
      request.body as Record<string, unknown>,
    );
    response.status(200).json({ preference });
  } catch (error) {
    next(error);
  }
});

notificationRouter.post("/read-all", async (request, response, next) => {
  try {
    const result = await markAllNotificationsRead(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

notificationRouter.get("/:id", async (request, response, next) => {
  try {
    const notification = await getNotification(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
});

notificationRouter.post("/:id/read", async (request, response, next) => {
  try {
    const notification = await markNotificationRead(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
});

notificationRouter.post("/:id/unread", async (request, response, next) => {
  try {
    const notification = await markNotificationUnread(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ notification });
  } catch (error) {
    next(error);
  }
});

alertRouter.get("/", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listOperationalAlerts(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

alertRouter.get("/:id", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const alert = await getOperationalAlert(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ alert });
  } catch (error) {
    next(error);
  }
});

alertRouter.post("/:id/acknowledge", requirePermission("security.acknowledge"), async (request, response, next) => {
  try {
    const alert = await acknowledgeOperationalAlert(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ alert });
  } catch (error) {
    next(error);
  }
});

alertRouter.post("/:id/resolve", requirePermission("security.acknowledge"), async (request, response, next) => {
  try {
    const alert = await resolveOperationalAlert(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ alert });
  } catch (error) {
    next(error);
  }
});
