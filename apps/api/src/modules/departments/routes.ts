import { Router } from "express";
import { prisma } from "../../db/client.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";

export const departmentRouter = Router();

departmentRouter.use(requireAuthentication);

departmentRouter.get("/", requirePermission("department.read", "workflow.manage", "material.manage"), async (request, response, next) => {
  try {
    const actor = actorFromRequest(request);
    const departments = await prisma.department.findMany({
      where: { organizationId: actor.user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true },
    });
    response.status(200).json({ departments });
  } catch (error) {
    next(error);
  }
});
