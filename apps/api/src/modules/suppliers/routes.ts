import { Router } from "express";
import { prisma } from "../../db/client.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import type { AuthedRequest } from "../auth/types.js";

export const supplierRouter = Router();

supplierRouter.use(requireAuthentication);

supplierRouter.get("/", requirePermission("supplier.read", "vehicle.read"), async (request, response, next) => {
  try {
    const auth = (request as AuthedRequest).auth;
    const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
    const suppliers = await prisma.supplier.findMany({
      where: {
        organizationId: auth.organizationId,
        deletedAt: null,
        ...(q === "" ? {} : { name: { contains: q, mode: "insensitive" as const } }),
      },
      orderBy: { name: "asc" },
      take: 50,
      select: { id: true, name: true, code: true },
    });
    response.status(200).json({ items: suppliers });
  } catch (error) {
    next(error);
  }
});
