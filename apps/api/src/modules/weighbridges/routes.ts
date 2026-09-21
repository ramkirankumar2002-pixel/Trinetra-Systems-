import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { weighbridgeAnomalyRouter } from "../anomalies/routes.js";
import { hardwareRouter } from "../hardware/routes.js";
import { listWeighbridges, simulateAnprRead, simulateWeightRead } from "./service.js";

export const weighbridgeRouter = Router();

weighbridgeRouter.use(requireAuthentication);
weighbridgeRouter.use(hardwareRouter);
weighbridgeRouter.use(weighbridgeAnomalyRouter);

weighbridgeRouter.get("/", requirePermission("weighbridge.read"), async (request, response, next) => {
  try {
    const result = await listWeighbridges(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

weighbridgeRouter.post(
  "/:id/anpr/simulate",
  requirePermission("transaction.create", "weighment.record"),
  async (request, response, next) => {
    try {
      const result = await simulateAnprRead(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ detection: result, simulated: true });
    } catch (error) {
      next(error);
    }
  },
);

weighbridgeRouter.post(
  "/:id/weight/simulate",
  requirePermission("weighment.record"),
  async (request, response, next) => {
    try {
      const result = await simulateWeightRead(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ reading: result, simulated: true });
    } catch (error) {
      next(error);
    }
  },
);
