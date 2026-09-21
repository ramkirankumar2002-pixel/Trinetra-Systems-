import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { sensitiveMutationRateLimit } from "../../middleware/sensitiveRateLimit.js";
import { actorFromRequest } from "../shared/actor.js";
import { createWorkflow, getWorkflow, listWorkflows, replaceWorkflowSteps, updateWorkflow } from "./service.js";
import {
  listWorkflowCapabilities,
  parseWorkflowCreateInput,
  parseWorkflowStepsInput,
  parseWorkflowWriteInput,
} from "./validators.js";

export const workflowCapabilityRouter = Router();
export const workflowRouter = Router();

workflowCapabilityRouter.use(requireAuthentication);
workflowRouter.use(requireAuthentication);

workflowCapabilityRouter.get("/", requirePermission("workflow.read", "workflow.manage"), (_request, response) => {
  response.status(200).json({ capabilities: listWorkflowCapabilities() });
});

workflowRouter.get("/", requirePermission("workflow.read", "workflow.manage"), async (request, response, next) => {
  try {
    const result = await listWorkflows(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

workflowRouter.post("/", sensitiveMutationRateLimit, requirePermission("workflow.manage"), async (request, response, next) => {
  try {
    const workflow = await createWorkflow(actorFromRequest(request), parseWorkflowCreateInput(request.body));
    response.status(201).json({ workflow });
  } catch (error) {
    next(error);
  }
});

workflowRouter.get("/:id", requirePermission("workflow.read", "workflow.manage"), async (request, response, next) => {
  try {
    const workflow = await getWorkflow(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ workflow });
  } catch (error) {
    next(error);
  }
});

workflowRouter.patch("/:id", sensitiveMutationRateLimit, requirePermission("workflow.manage"), async (request, response, next) => {
  try {
    const workflow = await updateWorkflow(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseWorkflowWriteInput(request.body, true),
    );
    response.status(200).json({ workflow });
  } catch (error) {
    next(error);
  }
});

workflowRouter.put("/:id/steps", sensitiveMutationRateLimit, requirePermission("workflow.manage"), async (request, response, next) => {
  try {
    const workflow = await replaceWorkflowSteps(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseWorkflowStepsInput(request.body),
    );
    response.status(200).json({ workflow });
  } catch (error) {
    next(error);
  }
});
