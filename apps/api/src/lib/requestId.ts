import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { formatReferenceId, isUsableRequestId } from "../domain/observability/correlation.js";

export type RequestWithId = Request & { requestId?: string };

export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header("x-request-id") ?? request.header("x-correlation-id");
  const requestId = isUsableRequestId(incoming) ? incoming : randomUUID();
  (request as RequestWithId).requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("X-Correlation-Id", requestId);
  response.setHeader("X-Reference-Id", formatReferenceId(requestId));
  next();
}

export function getRequestId(request: Request): string | undefined {
  return (request as RequestWithId).requestId;
}

export function getCorrelationId(request: Request): string | undefined {
  return getRequestId(request);
}
