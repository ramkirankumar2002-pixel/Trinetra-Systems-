import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { getDriverContext, recordDriverEvent } from "./service.js";
import { parseDriverEventInput } from "./validators.js";

export const driverRouter = Router();

driverRouter.use(requireAuthentication);
driverRouter.use(requirePermission("driver.mode"));

driverRouter.get("/context", async (request, response, next) => {
  try {
    const context = await getDriverContext(actorFromRequest(request));
    response.status(200).json(context);
  } catch (error) {
    next(error);
  }
});

driverRouter.post("/events", async (request, response, next) => {
  try {
    await recordDriverEvent(actorFromRequest(request), parseDriverEventInput(request.body));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});
