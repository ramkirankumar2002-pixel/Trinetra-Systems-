import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { getRequestId } from "../lib/requestId.js";
import { writeLog } from "../lib/logger.js";
import { recordApiRequest } from "../lib/metrics.js";

const SKIP_PREFIXES = ["/health"];

export function requestMetricsMiddleware(request: Request, response: Response, next: NextFunction): void {
  if (SKIP_PREFIXES.some((prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`))) {
    next();
    return;
  }

  const started = process.hrtime.bigint();
  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const route = requestRoute(request);
    const method = request.method.toUpperCase();
    const status = response.statusCode;
    recordApiRequest({ method, route, status, durationMs });

    const correlationId = getRequestId(request);
    if (status >= 500) {
      writeLog("error", "http_request_failed", {
        correlationId,
        method,
        route,
        status,
        durationMs: Math.round(durationMs),
        errorCategory: "SYSTEM_ERROR",
      });
      return;
    }
    if (durationMs >= env.slowRequestMs) {
      writeLog("warn", "http_request_slow", {
        correlationId,
        method,
        route,
        status,
        durationMs: Math.round(durationMs),
        errorCategory: "SYSTEM_ERROR",
      });
    }
  });

  next();
}

function requestRoute(request: Request): string {
  const matched = request.route && typeof request.route.path === "string" ? request.route.path : null;
  if (matched) {
    return `${request.baseUrl}${matched}`;
  }
  return normalizePath(request.path);
}

function normalizePath(path: string): string {
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id");
}
