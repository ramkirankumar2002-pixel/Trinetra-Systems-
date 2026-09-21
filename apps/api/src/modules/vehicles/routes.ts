import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  createVehicle,
  findVehicleByRegistration,
  getVehicle,
  listVehicles,
  setVehicleActive,
  updateVehicle,
} from "./service.js";
import { parseVehicleCreateInput, parseVehicleUpdateInput } from "./validators.js";

export const vehicleRouter = Router();

vehicleRouter.use(requireAuthentication);

vehicleRouter.get("/", requirePermission("vehicle.read"), async (request, response, next) => {
  try {
    const result = await listVehicles(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

vehicleRouter.get("/lookup", requirePermission("vehicle.read"), async (request, response, next) => {
  try {
    const registration = typeof request.query.registration === "string" ? request.query.registration : "";
    const vehicle = await findVehicleByRegistration(actorFromRequest(request), registration);
    response.status(200).json({ vehicle });
  } catch (error) {
    next(error);
  }
});

vehicleRouter.get("/:id", requirePermission("vehicle.read"), async (request, response, next) => {
  try {
    const vehicle = await getVehicle(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ vehicle });
  } catch (error) {
    next(error);
  }
});

vehicleRouter.post("/", requirePermission("vehicle.manage"), async (request, response, next) => {
  try {
    const input = parseVehicleCreateInput(request.body);
    const vehicle = await createVehicle(actorFromRequest(request), input);
    response.status(201).json({ vehicle });
  } catch (error) {
    next(error);
  }
});

vehicleRouter.patch("/:id", requirePermission("vehicle.manage"), async (request, response, next) => {
  try {
    const vehicle = await updateVehicle(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseVehicleUpdateInput(request.body),
    );
    response.status(200).json({ vehicle });
  } catch (error) {
    next(error);
  }
});

vehicleRouter.post("/:id/deactivate", requirePermission("vehicle.manage"), async (request, response, next) => {
  try {
    const vehicle = await setVehicleActive(actorFromRequest(request), routeParam(request.params.id), false);
    response.status(200).json({ vehicle });
  } catch (error) {
    next(error);
  }
});

vehicleRouter.post("/:id/activate", requirePermission("vehicle.manage"), async (request, response, next) => {
  try {
    const vehicle = await setVehicleActive(actorFromRequest(request), routeParam(request.params.id), true);
    response.status(200).json({ vehicle });
  } catch (error) {
    next(error);
  }
});
