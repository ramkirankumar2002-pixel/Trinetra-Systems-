import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { sensitiveMutationRateLimit } from "../../middleware/sensitiveRateLimit.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  acknowledgeWeightAnomaly,
  endMaintenance,
  feedAnomalyReadings,
  getAnomalyConfig,
  getWeightAnomaly,
  getWeightHealth,
  listWeightAnomalies,
  markFalsePositive,
  resolveWeightAnomaly,
  runAnomalyScenario,
  startMaintenance,
  updateAnomalyConfig,
} from "./service.js";

export const anomalyRouter = Router();

anomalyRouter.use(requireAuthentication);
anomalyRouter.use(requireRequestedTenantScope);

anomalyRouter.get("/", requirePermission("anomaly.read", "security.read", "weighbridge.read"), async (request, response, next) => {
  try {
    response.status(200).json(await listWeightAnomalies(actorFromRequest(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

anomalyRouter.get("/:id", requirePermission("anomaly.read", "security.read", "weighbridge.read"), async (request, response, next) => {
  try {
    response.status(200).json(await getWeightAnomaly(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

anomalyRouter.post(
  "/:id/acknowledge",
  requirePermission("anomaly.acknowledge", "security.acknowledge"),
  async (request, response, next) => {
    try {
      response.status(200).json(await acknowledgeWeightAnomaly(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);

anomalyRouter.post("/:id/resolve", requirePermission("anomaly.resolve"), async (request, response, next) => {
  try {
    response.status(200).json(await resolveWeightAnomaly(actorFromRequest(request), routeParam(request.params.id), request.body));
  } catch (error) {
    next(error);
  }
});

anomalyRouter.post("/:id/false-positive", requirePermission("anomaly.resolve"), async (request, response, next) => {
  try {
    response.status(200).json(await markFalsePositive(actorFromRequest(request), routeParam(request.params.id), request.body));
  } catch (error) {
    next(error);
  }
});

export const weighbridgeAnomalyRouter = Router();

weighbridgeAnomalyRouter.get(
  "/:id/anomaly/config",
  requirePermission("anomaly.read", "anomaly.configure", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await getAnomalyConfig(actorFromRequest(request), routeParam(request.params.id)));
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.patch(
  "/:id/anomaly/config",
  sensitiveMutationRateLimit,
  requirePermission("anomaly.configure"),
  async (request, response, next) => {
    try {
      response.status(200).json(await updateAnomalyConfig(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.get(
  "/:id/weight-health",
  requirePermission("anomaly.read", "weighbridge.read", "weighment.record"),
  async (request, response, next) => {
    try {
      response.status(200).json({ health: await getWeightHealth(actorFromRequest(request), routeParam(request.params.id)) });
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.post(
  "/:id/anomaly/feed",
  requirePermission("weighment.record", "anomaly.configure", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await feedAnomalyReadings(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.post(
  "/:id/anomaly/scenario",
  requirePermission("weighment.record", "anomaly.configure", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await runAnomalyScenario(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.post(
  "/:id/maintenance/start",
  requirePermission("maintenance.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await startMaintenance(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeAnomalyRouter.post(
  "/:id/maintenance/end",
  requirePermission("maintenance.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await endMaintenance(actorFromRequest(request), routeParam(request.params.id), request.body));
    } catch (error) {
      next(error);
    }
  },
);
