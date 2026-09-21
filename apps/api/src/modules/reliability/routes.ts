import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { HttpError } from "../../lib/httpError.js";
import { routeParam } from "../../lib/routeParam.js";
import { actorFromRequest } from "../shared/actor.js";
import { isExportCategory, buildReliabilityExport } from "./export.js";
import { runReliabilityScan } from "./scanner.js";
import {
  getReliabilityStatus,
  listBackupRuns,
  listStaleGateways,
  listStaleTransactions,
  runConsistencyReport,
  triggerBackup,
} from "./service.js";

export const reliabilityRouter = Router();

reliabilityRouter.use(requireAuthentication);
reliabilityRouter.use(requireRequestedTenantScope);

reliabilityRouter.get("/status", requirePermission("reliability.read"), async (request, response, next) => {
  try {
    const status = await getReliabilityStatus(actorFromRequest(request));
    response.status(200).json({ status });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get("/backups", requirePermission("reliability.read"), async (_request, response, next) => {
  try {
    response.status(200).json({ items: await listBackupRuns() });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.post("/backups", requirePermission("reliability.manage"), async (request, response, next) => {
  try {
    const backup = await triggerBackup(actorFromRequest(request));
    response.status(201).json({ backup });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get("/stale-transactions", requirePermission("reliability.read"), async (request, response, next) => {
  try {
    response.status(200).json({ items: await listStaleTransactions(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get("/gateways", requirePermission("reliability.read"), async (request, response, next) => {
  try {
    response.status(200).json({ items: await listStaleGateways(actorFromRequest(request)) });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get("/consistency", requirePermission("reliability.read"), async (request, response, next) => {
  try {
    const report = await runConsistencyReport(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(report);
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.post("/scan", requirePermission("reliability.manage"), async (request, response, next) => {
  try {
    const result = await runReliabilityScan(actorFromRequest(request));
    response.status(200).json({ result });
  } catch (error) {
    next(error);
  }
});

reliabilityRouter.get(
  "/export/:category",
  requirePermission("reliability.read", "report.read", "audit.read", "security.read"),
  async (request, response, next) => {
    try {
      const category = routeParam(request.params.category);
      if (!isExportCategory(category)) {
        throw new HttpError(400, "Export category is invalid");
      }
      const exported = await buildReliabilityExport(
        actorFromRequest(request),
        category,
        request.query as Record<string, unknown>,
      );
      response.status(200).json(exported);
    } catch (error) {
      next(error);
    }
  },
);
