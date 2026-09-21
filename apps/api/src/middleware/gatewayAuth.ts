import type { NextFunction, Request, Response } from "express";
import { hashGatewayCredential, isGatewayCredentialFormat } from "../domain/edgeCredentials.js";
import { deriveGatewayRuntimeStatus } from "../domain/edgeGatewayStatus.js";
import { prisma } from "../db/client.js";
import { HttpError } from "../lib/httpError.js";
import type { GatewayRequest } from "../modules/edge/types.js";
import { env } from "../config/env.js";

export async function requireGatewayAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = readGatewayToken(request);
    if (!token || !isGatewayCredentialFormat(token)) {
      throw new HttpError(401, "Gateway is not authenticated");
    }

    const credentialHash = hashGatewayCredential(token);
    const gateway = await prisma.edgeGateway.findFirst({
      where: { credentialHash },
      include: { organization: { select: { status: true } } },
    });
    if (!gateway) {
      throw new HttpError(401, "Gateway is not authenticated");
    }
    if (gateway.revokedAt !== null || !gateway.enabled) {
      throw new HttpError(403, "Gateway is revoked or disabled");
    }

    const status = deriveGatewayRuntimeStatus({
      enabled: gateway.enabled,
      revokedAt: gateway.revokedAt,
      lastHeartbeatAt: gateway.lastHeartbeatAt,
      nowMs: Date.now(),
      offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
    });

    (request as GatewayRequest).gateway = {
      id: gateway.id,
      organizationId: gateway.organizationId,
      organizationStatus: gateway.organization.status,
      siteId: gateway.siteId,
      code: gateway.code,
      name: gateway.name,
      enabled: gateway.enabled,
      status,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function readGatewayToken(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    return token === "" ? undefined : token;
  }
  const named = request.headers["x-trinetra-gateway-token"];
  if (typeof named === "string" && named.trim() !== "") {
    return named.trim();
  }
  return undefined;
}
