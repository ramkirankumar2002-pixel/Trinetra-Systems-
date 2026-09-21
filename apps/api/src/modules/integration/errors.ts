import type { Request, Response } from "express";
import { getRequestId } from "../../lib/requestId.js";
import { externalErrorCodeFromStatus } from "../../domain/integration/index.js";

export function isExternalApiRequest(request: Request): boolean {
  return request.originalUrl.startsWith("/api/v1/ext");
}

export function sendExternalError(request: Request, response: Response, status: number, message: string): void {
  const requestId = getRequestId(request) ?? "unknown";
  response.status(status).json({
    error: {
      code: externalErrorCodeFromStatus(status),
      message,
    },
    requestId,
    correlationId: requestId,
  });
}
