import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  createAssignmentRule,
  createUnloadingPoint,
  deleteAssignmentRule,
  listAccessibleSites,
  listAssignmentRules,
  listUnloadingPoints,
  updateAssignmentRule,
  updateUnloadingPoint,
} from "./service.js";
import {
  parseAssignmentRuleCreateInput,
  parseUnloadingPointCreateInput,
  parseUnloadingPointUpdateInput,
} from "./validators.js";

export const unloadingPointRouter = Router();
export const unloadingPointRuleRouter = Router();
export const siteRouter = Router();

unloadingPointRouter.use(requireAuthentication);
unloadingPointRuleRouter.use(requireAuthentication);
siteRouter.use(requireAuthentication);

unloadingPointRouter.get("/", requirePermission("transaction.read", "unloading.assign", "unloading.manage"), async (request, response, next) => {
  try {
    const result = await listUnloadingPoints(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

unloadingPointRouter.post("/", requirePermission("unloading.assign"), async (request, response, next) => {
  try {
    const point = await createUnloadingPoint(actorFromRequest(request), parseUnloadingPointCreateInput(request.body));
    response.status(201).json({ unloadingPoint: point });
  } catch (error) {
    next(error);
  }
});

unloadingPointRouter.patch("/:id", requirePermission("unloading.assign"), async (request, response, next) => {
  try {
    const point = await updateUnloadingPoint(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseUnloadingPointUpdateInput(request.body),
    );
    response.status(200).json({ unloadingPoint: point });
  } catch (error) {
    next(error);
  }
});

unloadingPointRuleRouter.get("/", requirePermission("unloading.assign", "transaction.read"), async (request, response, next) => {
  try {
    const result = await listAssignmentRules(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

unloadingPointRuleRouter.post("/", requirePermission("unloading.assign"), async (request, response, next) => {
  try {
    const rule = await createAssignmentRule(actorFromRequest(request), parseAssignmentRuleCreateInput(request.body));
    response.status(201).json({ rule });
  } catch (error) {
    next(error);
  }
});

unloadingPointRuleRouter.patch("/:id", requirePermission("unloading.assign"), async (request, response, next) => {
  try {
    const body = request.body as Record<string, unknown>;
    const rule = await updateAssignmentRule(actorFromRequest(request), routeParam(request.params.id), {
      ...(body.priority === undefined ? {} : { priority: Number(body.priority) }),
      ...(body.isActive === undefined ? {} : { isActive: body.isActive === true }),
    });
    response.status(200).json({ rule });
  } catch (error) {
    next(error);
  }
});

unloadingPointRuleRouter.delete("/:id", requirePermission("unloading.assign"), async (request, response, next) => {
  try {
    await deleteAssignmentRule(actorFromRequest(request), routeParam(request.params.id));
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

siteRouter.get("/", requirePermission("transaction.read", "unloading.assign"), async (request, response, next) => {
  try {
    const result = await listAccessibleSites(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});
