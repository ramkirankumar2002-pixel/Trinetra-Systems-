import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { getPilotOverview, recordCommissioningTest, updateInventoryDevice, updateSiteOperationMode } from "./service.js";
import { parseRecordCommissioningInput, parseUpdateInventoryInput, parseUpdateSiteModeInput } from "./validators.js";

export const pilotRouter = Router();

pilotRouter.use(requireAuthentication);

pilotRouter.get("/", requirePermission("hardware.pilot", "weighbridge.manage", "gateway.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await getPilotOverview(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

pilotRouter.patch(
  "/sites/:siteId/mode",
  requirePermission("hardware.pilot", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      const site = await updateSiteOperationMode(
        actorFromRequest(request),
        routeParam(request.params.siteId),
        parseUpdateSiteModeInput(request.body),
      );
      response.status(200).json({ site });
    } catch (error) {
      next(error);
    }
  },
);

pilotRouter.patch(
  "/devices/:deviceId",
  requirePermission("hardware.pilot", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      const device = await updateInventoryDevice(
        actorFromRequest(request),
        routeParam(request.params.deviceId),
        parseUpdateInventoryInput(request.body),
      );
      response.status(200).json({ device });
    } catch (error) {
      next(error);
    }
  },
);

pilotRouter.post(
  "/commissioning",
  requirePermission("hardware.pilot", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      const test = await recordCommissioningTest(actorFromRequest(request), parseRecordCommissioningInput(request.body));
      response.status(200).json({ test });
    } catch (error) {
      next(error);
    }
  },
);
