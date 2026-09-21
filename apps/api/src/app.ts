import { Prisma } from "@prisma/client";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import { env } from "./config/env.js";
import { isCorsOriginAllowed, parseCorsOrigins } from "./config/security.js";
import { HttpError } from "./lib/httpError.js";
import { writeLog } from "./lib/logger.js";
import { getRequestId, requestIdMiddleware } from "./lib/requestId.js";
import { formatReferenceId } from "./domain/observability/correlation.js";
import { categoryFromHttpStatus, categoryFromPrismaCode } from "./domain/observability/errorCategory.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { requestMetricsMiddleware } from "./middleware/requestMetrics.js";
import { authRouter } from "./modules/auth/routes.js";
import { departmentRouter } from "./modules/departments/routes.js";
import { supplierRouter } from "./modules/suppliers/routes.js";
import { documentRouter, documentTypeRouter } from "./modules/documents/routes.js";
import { materialRouter, materialUnitRouter } from "./modules/materials/routes.js";
import { approvalRouter } from "./modules/approvals/routes.js";
import { alertRouter, notificationRouter } from "./modules/notifications/routes.js";
import { dashboardRouter, reportRouter } from "./modules/dashboard/routes.js";
import { transactionRouter } from "./modules/transactions/routes.js";
import { vehicleRouter } from "./modules/vehicles/routes.js";
import { cameraRouter } from "./modules/cameras/routes.js";
import { edgeIngestRouter, gatewayRouter } from "./modules/edge/routes.js";
import { edgeSyncRouter, syncRouter } from "./modules/sync/routes.js";
import { pilotRouter } from "./modules/pilot/routes.js";
import { anomalyRouter } from "./modules/anomalies/routes.js";
import { weighbridgeRouter } from "./modules/weighbridges/routes.js";
import { driverRouter } from "./modules/driver/routes.js";
import {
  siteRouter,
  unloadingPointRouter,
  unloadingPointRuleRouter,
} from "./modules/unloadingPoints/routes.js";
import { workflowCapabilityRouter, workflowRouter } from "./modules/workflows/routes.js";
import { reliabilityRouter } from "./modules/reliability/routes.js";
import { monitoringRouter } from "./modules/monitoring/routes.js";
import { tenancyRouter } from "./modules/tenancy/routes.js";
import { onboardingRouter } from "./modules/onboarding/routes.js";
import { supportRouter } from "./modules/support/routes.js";
import { integrationAdminRouter } from "./modules/integration/adminRoutes.js";
import { integrationExtRouter } from "./modules/integration/extRoutes.js";
import { isExternalApiRequest, sendExternalError } from "./modules/integration/errors.js";
import { publicVersionPayload } from "./config/version.js";
import { livenessPayload, readinessPayload } from "./modules/reliability/health.js";
import type { AuthedRequest } from "./modules/auth/types.js";

const unexpectedErrorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId = getRequestId(request) ?? "unknown";
  const correlationId = requestId;
  const referenceId = formatReferenceId(requestId);
  const userId = (request as AuthedRequest).auth?.id;

  if (error instanceof HttpError) {
    if (isExternalApiRequest(request)) {
      sendExternalError(
        request,
        response,
        error.status >= 500 ? 500 : error.status,
        error.status >= 500 ? "Something went wrong. Please contact the administrator." : error.message,
      );
      return;
    }
    if (error.status >= 500) {
      writeLog("error", "http_error", {
        requestId,
        correlationId,
        userId,
        status: error.status,
        errorCategory: error.category,
      });
      response.status(error.status).json({
        error: "Something went wrong. Please contact the administrator.",
        requestId,
        correlationId,
        referenceId,
      });
      return;
    }
    writeLog(error.status >= 400 && error.status < 500 ? "warn" : "error", "http_error", {
      requestId,
      correlationId,
      userId,
      status: error.status,
      errorCategory: error.category,
    });
    response.status(error.status).json({
      error: error.message,
      requestId,
      correlationId,
      referenceId,
      errorCategory: error.category,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    if (isExternalApiRequest(request)) {
      sendExternalError(request, response, 503, "Service temporarily unavailable");
      return;
    }
    writeLog("error", "database_unavailable", {
      requestId,
      correlationId,
      errorCategory: "DATABASE_ERROR",
    });
    response.status(503).json({
      error: "Database is unavailable",
      requestId,
      correlationId,
      referenceId,
      errorCategory: "DATABASE_ERROR",
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const errorCategory = categoryFromPrismaCode(error.code);
    writeLog("error", "prisma_known_error", {
      requestId,
      correlationId,
      code: error.code,
      errorCategory,
    });
    if (error.code === "P2002") {
      if (isExternalApiRequest(request)) {
        sendExternalError(request, response, 409, "This record already exists");
        return;
      }
      response.status(409).json({
        error: "This record already exists",
        requestId,
        correlationId,
        referenceId,
        errorCategory,
      });
      return;
    }
    if (error.code === "P2025") {
      if (isExternalApiRequest(request)) {
        sendExternalError(request, response, 404, "Record not found");
        return;
      }
      response.status(404).json({
        error: "Record not found",
        requestId,
        correlationId,
        referenceId,
        errorCategory,
      });
      return;
    }
    if (isExternalApiRequest(request)) {
      sendExternalError(request, response, 400, "The request could not be completed");
      return;
    }
    response.status(400).json({
      error: "The request could not be completed",
      requestId,
      correlationId,
      referenceId,
      errorCategory,
    });
    return;
  }

  if (isClientRequestError(error)) {
    const errorCategory = categoryFromHttpStatus(error.status);
    if (isExternalApiRequest(request)) {
      sendExternalError(request, response, error.status, "Invalid request");
      return;
    }
    response.status(error.status).json({
      error: "Invalid request",
      requestId,
      correlationId,
      referenceId,
      errorCategory,
    });
    return;
  }

  writeLog("error", "unhandled_error", {
    requestId,
    correlationId,
    userId,
    name: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : "unknown",
    errorCategory: "SYSTEM_ERROR",
  });
  if (isExternalApiRequest(request)) {
    sendExternalError(request, response, 500, "Something went wrong. Please contact the administrator.");
    return;
  }
  response.status(500).json({
    error: "Something went wrong. Please contact the administrator.",
    requestId,
    correlationId,
    referenceId,
  });
};

function isClientRequestError(error: unknown): error is { status: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

export function createApp() {
  const app = express();
  const allowedOrigins = parseCorsOrigins(env.corsOrigin);

  app.disable("x-powered-by");
  if (env.trustProxy) {
    app.set("trust proxy", 1);
  }
  app.use(requestIdMiddleware);
  app.use(requestMetricsMiddleware);
  app.use(securityHeaders);
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, isCorsOriginAllowed(origin, allowedOrigins));
      },
      credentials: true,
    }),
  );
  app.use("/api/v1/edge", express.json({ limit: env.edgeIngestMaxBytes }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "trinetra-api",
      ...publicVersionPayload(),
    });
  });

  app.get("/api/v1/system", (_request, response) => {
    response.status(200).json(publicVersionPayload());
  });

  app.get("/health/live", (_request, response) => {
    response.status(200).json(livenessPayload());
  });

  app.get("/health/ready", async (_request, response, next) => {
    try {
      const payload = await readinessPayload();
      response.status(payload.status === "unavailable" ? 503 : 200).json(payload);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/vehicles", vehicleRouter);
  app.use("/api/v1/suppliers", supplierRouter);
  app.use("/api/v1/weighbridges", weighbridgeRouter);
  app.use("/api/v1/driver", driverRouter);
  app.use("/api/v1/anomalies", anomalyRouter);
  app.use("/api/v1/cameras", cameraRouter);
  app.use("/api/v1/gateways", gatewayRouter);
  app.use("/api/v1/edge", edgeIngestRouter);
  app.use("/api/v1/edge/sync", edgeSyncRouter);
  app.use("/api/v1/sync", syncRouter);
  app.use("/api/v1/pilot", pilotRouter);
  app.use("/api/v1/document-types", documentTypeRouter);
  app.use("/api/v1/documents", documentRouter);
  app.use("/api/v1/material-units", materialUnitRouter);
  app.use("/api/v1/materials", materialRouter);
  app.use("/api/v1/workflow-capabilities", workflowCapabilityRouter);
  app.use("/api/v1/workflows", workflowRouter);
  app.use("/api/v1/departments", departmentRouter);
  app.use("/api/v1/transactions", transactionRouter);
  app.use("/api/v1/dashboard", dashboardRouter);
  app.use("/api/v1/reports", reportRouter);
  app.use("/api/v1/approvals", approvalRouter);
  app.use("/api/v1/notifications", notificationRouter);
  app.use("/api/v1/alerts", alertRouter);
  app.use("/api/v1/unloading-points", unloadingPointRouter);
  app.use("/api/v1/unloading-point-rules", unloadingPointRuleRouter);
  app.use("/api/v1/sites", siteRouter);
  app.use("/api/v1/reliability", reliabilityRouter);
  app.use("/api/v1/monitoring", monitoringRouter);
  app.use("/api/v1/tenancy", tenancyRouter);
  app.use("/api/v1/onboarding", onboardingRouter);
  app.use("/api/v1/support", supportRouter);
  app.use("/api/v1/integrations", integrationAdminRouter);
  app.use("/api/v1/ext", integrationExtRouter);

  app.use((request, response) => {
    if (isExternalApiRequest(request)) {
      sendExternalError(request, response, 404, "Not found");
      return;
    }
    const requestId = getRequestId(request);
    if (!requestId) {
      response.status(404).json({ error: "Not found" });
      return;
    }
    response.status(404).json({
      error: "Not found",
      requestId,
      correlationId: requestId,
      referenceId: formatReferenceId(requestId),
    });
  });

  app.use(unexpectedErrorHandler);

  return app;
}
