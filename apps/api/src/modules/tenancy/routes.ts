import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  getOrganizationDirectory,
  updateOrganizationStatus,
  updateSiteStatus,
} from "./service.js";
import { parseOrganizationStatusInput, parseSiteStatusInput } from "./validators.js";

export const tenancyRouter = Router();

tenancyRouter.use(requireAuthentication);

tenancyRouter.get("/directory", requirePermission("user.read", "user.manage"), async (request, response, next) => {
  try {
    const directory = await getOrganizationDirectory(actorFromRequest(request));
    response.status(200).json({ directory });
  } catch (error) {
    next(error);
  }
});

tenancyRouter.patch("/organization", requirePermission("user.manage"), async (request, response, next) => {
  try {
    const input = parseOrganizationStatusInput(request.body);
    const organization = await updateOrganizationStatus(actorFromRequest(request), input.status);
    response.status(200).json({ organization });
  } catch (error) {
    next(error);
  }
});

tenancyRouter.patch("/sites/:id", requirePermission("user.manage"), async (request, response, next) => {
  try {
    const input = parseSiteStatusInput(request.body);
    const site = await updateSiteStatus(actorFromRequest(request), routeParam(request.params.id), input.status);
    response.status(200).json({ site });
  } catch (error) {
    next(error);
  }
});
