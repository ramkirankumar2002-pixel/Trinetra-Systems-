import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  assignMaterialWorkflow,
  createMaterial,
  getMaterial,
  listMaterialUnits,
  listMaterials,
  setMaterialActive,
  updateMaterial,
} from "./service.js";
import { parseMaterialAssignmentInput, parseMaterialCreateInput, parseMaterialUpdateInput } from "./validators.js";

export const materialUnitRouter = Router();
export const materialRouter = Router();

materialUnitRouter.use(requireAuthentication);
materialRouter.use(requireAuthentication);

materialUnitRouter.get("/", requirePermission("material.read", "material.manage"), (_request, response) => {
  response.status(200).json({ units: listMaterialUnits(), configurable: true });
});

materialRouter.get("/", requirePermission("material.read"), async (request, response, next) => {
  try {
    const result = await listMaterials(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

materialRouter.post("/", requirePermission("material.manage"), async (request, response, next) => {
  try {
    const material = await createMaterial(actorFromRequest(request), parseMaterialCreateInput(request.body));
    response.status(201).json({ material });
  } catch (error) {
    next(error);
  }
});

materialRouter.get("/:id", requirePermission("material.read"), async (request, response, next) => {
  try {
    const material = await getMaterial(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ material });
  } catch (error) {
    next(error);
  }
});

materialRouter.patch("/:id", requirePermission("material.manage"), async (request, response, next) => {
  try {
    const material = await updateMaterial(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseMaterialUpdateInput(request.body),
    );
    response.status(200).json({ material });
  } catch (error) {
    next(error);
  }
});

materialRouter.post("/:id/deactivate", requirePermission("material.manage"), async (request, response, next) => {
  try {
    const material = await setMaterialActive(actorFromRequest(request), routeParam(request.params.id), false);
    response.status(200).json({ material });
  } catch (error) {
    next(error);
  }
});

materialRouter.post("/:id/activate", requirePermission("material.manage"), async (request, response, next) => {
  try {
    const material = await setMaterialActive(actorFromRequest(request), routeParam(request.params.id), true);
    response.status(200).json({ material });
  } catch (error) {
    next(error);
  }
});

materialRouter.get("/:id/workflow", requirePermission("material.read"), async (request, response, next) => {
  try {
    const material = await getMaterial(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({
      materialId: material.id,
      defaultWorkflow: material.defaultWorkflow,
      assignments: material.assignments,
    });
  } catch (error) {
    next(error);
  }
});

materialRouter.put("/:id/workflow", requirePermission("workflow.manage", "material.manage"), async (request, response, next) => {
  try {
    const material = await assignMaterialWorkflow(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseMaterialAssignmentInput(request.body),
    );
    response.status(200).json({ material });
  } catch (error) {
    next(error);
  }
});
