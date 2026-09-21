import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { metrics } from "../../lib/metrics.js";
import {
  getMonitoringHealth,
  getMonitoringStatus,
  getOperationalMetrics,
  listMonitorDevices,
  listMonitorGateways,
  listMonitorHistory,
  listMonitorIncidents,
  listMonitorSync,
} from "./service.js";
import { wantsPrometheus } from "./validators.js";

export const monitoringRouter = Router();

monitoringRouter.use(requireAuthentication);
monitoringRouter.use(requireRequestedTenantScope);

monitoringRouter.get("/status", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json({ status: await getMonitoringStatus(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/health", requirePermission("monitoring.read"), async (_request, response, next) => {
  try {
    response.status(200).json(await getMonitoringHealth());
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/gateways", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json({ items: await listMonitorGateways(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/devices", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json({ items: await listMonitorDevices(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/sync", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json({ items: await listMonitorSync(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/metrics", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    if (wantsPrometheus(request.query as Record<string, unknown>)) {
      response.status(200).type("text/plain; charset=utf-8").send(metrics.toPrometheusText());
      return;
    }
    response.status(200).json(await getOperationalMetrics(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/incidents", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json(
      await listMonitorIncidents(actorFromRequest(request), request.query as Record<string, unknown>, { openOnly: true }),
    );
  } catch (error) {
    next(error);
  }
});

monitoringRouter.get("/history", requirePermission("monitoring.read"), async (request, response, next) => {
  try {
    response.status(200).json(await listMonitorHistory(actorFromRequest(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});
