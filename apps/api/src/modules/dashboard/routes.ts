import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import { reportQueryRateLimit } from "../../middleware/resourceRateLimit.js";
import { routeParam } from "../../lib/routeParam.js";
import {
  dashboardLookups,
  getDashboard,
  getDashboardCharts,
  listDashboardApprovals,
  listDashboardAudit,
  listDashboardExceptions,
  listLiveTransactions,
  listPendingUnloading,
  listRecentTransactions,
  reportExceptions,
  reportLookups,
  reportMaterials,
  reportTransactions,
  reportVehicles,
} from "./service.js";
import {
  reportAnomalies,
  reportApprovals,
  reportCatalogPayload,
  reportDaily,
  reportSuppliers,
  reportSync,
  reportWeighbridges,
  reportWeighments,
  reportWorkflow,
} from "./reportAnalytics.js";
import { exportReport } from "./reportExport.js";

export const dashboardRouter = Router();
export const reportRouter = Router();

dashboardRouter.use(requireAuthentication);
dashboardRouter.use(requireRequestedTenantScope);
reportRouter.use(requireAuthentication);
reportRouter.use(requireRequestedTenantScope);
reportRouter.use(reportQueryRateLimit);

dashboardRouter.get("/lookups", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const lookups = await dashboardLookups(actorFromRequest(request));
    response.status(200).json(lookups);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const dashboard = await getDashboard(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json({ dashboard });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/live", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listLiveTransactions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/recent", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listRecentTransactions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/approvals", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listDashboardApprovals(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/unloading", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listPendingUnloading(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/exceptions", requirePermission("dashboard.read"), async (request, response, next) => {
  try {
    const result = await listDashboardExceptions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/charts", requirePermission("dashboard.read", "report.read"), async (request, response, next) => {
  try {
    const charts = await getDashboardCharts(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json({ charts });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/audit", requirePermission("audit.read"), async (request, response, next) => {
  try {
    const result = await listDashboardAudit(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/lookups", requirePermission("report.read"), async (request, response, next) => {
  try {
    const lookups = await reportLookups(actorFromRequest(request));
    response.status(200).json(lookups);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/transactions", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportTransactions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/materials", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportMaterials(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/vehicles", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportVehicles(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/exceptions", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportExceptions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/weighments", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportWeighments(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/suppliers", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportSuppliers(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/weighbridges", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportWeighbridges(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/workflow", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportWorkflow(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/approvals", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportApprovals(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/anomalies", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportAnomalies(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/sync", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportSync(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/daily", requirePermission("report.read"), async (request, response, next) => {
  try {
    const result = await reportDaily(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/catalog", requirePermission("report.read"), async (_request, response, next) => {
  try {
    response.status(200).json(await reportCatalogPayload());
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/:reportId/export", requirePermission("report.read"), async (request, response, next) => {
  try {
    const exported = await exportReport(
      actorFromRequest(request),
      routeParam(request.params.reportId),
      request.query as Record<string, unknown>,
    );
    response.status(200).json(exported);
  } catch (error) {
    next(error);
  }
});
