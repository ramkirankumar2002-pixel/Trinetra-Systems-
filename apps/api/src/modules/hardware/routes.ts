import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requirePermission } from "../../middleware/authorize.js";
import { sensitiveMutationRateLimit } from "../../middleware/sensitiveRateLimit.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  getHardwareDevice,
  getLiveWeight,
  listHardwareDevices,
  refreshHardwareStatus,
  setHardwareEnabled,
  testHardwareConnection,
  updateHardwareDevice,
} from "./service.js";

export const hardwareRouter = Router();

hardwareRouter.get("/hardware", requirePermission("weighbridge.read", "weighbridge.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listHardwareDevices(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

hardwareRouter.get(
  "/:id/hardware",
  requirePermission("weighbridge.read", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      const device = await getHardwareDevice(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ device });
    } catch (error) {
      next(error);
    }
  },
);

hardwareRouter.patch("/:id/hardware", sensitiveMutationRateLimit, requirePermission("weighbridge.manage"), async (request, response, next) => {
  try {
    const device = await updateHardwareDevice(actorFromRequest(request), routeParam(request.params.id), request.body);
    response.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

hardwareRouter.post("/:id/hardware/enable", sensitiveMutationRateLimit, requirePermission("weighbridge.manage"), async (request, response, next) => {
  try {
    const device = await setHardwareEnabled(actorFromRequest(request), routeParam(request.params.id), true);
    response.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

hardwareRouter.post("/:id/hardware/disable", sensitiveMutationRateLimit, requirePermission("weighbridge.manage"), async (request, response, next) => {
  try {
    const device = await setHardwareEnabled(actorFromRequest(request), routeParam(request.params.id), false);
    response.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

hardwareRouter.post("/:id/hardware/test", requirePermission("weighbridge.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await testHardwareConnection(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

hardwareRouter.post("/:id/hardware/refresh", requirePermission("weighbridge.read", "weighbridge.manage"), async (request, response, next) => {
  try {
    const device = await refreshHardwareStatus(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

hardwareRouter.get(
  "/:id/live-weight",
  requirePermission("weighbridge.read", "weighment.record", "weighbridge.manage"),
  async (request, response, next) => {
    try {
      response.status(200).json(await getLiveWeight(actorFromRequest(request), routeParam(request.params.id)));
    } catch (error) {
      next(error);
    }
  },
);
