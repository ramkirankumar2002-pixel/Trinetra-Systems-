import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { skipReadsRequireOperationalOrganization } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { approveRequest, getApproval, listApprovals, rejectRequest } from "./service.js";
import { parseApproveInput, parseRejectInput } from "./validators.js";

export const approvalRouter = Router();

approvalRouter.use(requireAuthentication);
approvalRouter.use(skipReadsRequireOperationalOrganization);

approvalRouter.get("/", requirePermission("approval.decide"), async (request, response, next) => {
  try {
    const result = await listApprovals(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

approvalRouter.get("/:id", requirePermission("approval.decide"), async (request, response, next) => {
  try {
    const approval = await getApproval(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ approval });
  } catch (error) {
    next(error);
  }
});

approvalRouter.post("/:id/approve", requirePermission("approval.decide"), async (request, response, next) => {
  try {
    const approval = await approveRequest(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseApproveInput(request.body),
    );
    response.status(200).json({ approval });
  } catch (error) {
    next(error);
  }
});

approvalRouter.post("/:id/reject", requirePermission("approval.decide"), async (request, response, next) => {
  try {
    const approval = await rejectRequest(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseRejectInput(request.body),
    );
    response.status(200).json({ approval });
  } catch (error) {
    next(error);
  }
});
