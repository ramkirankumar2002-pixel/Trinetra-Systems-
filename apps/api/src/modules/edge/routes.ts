import { Router } from "express";
import { requireGatewayAuth } from "../../middleware/gatewayAuth.js";
import { requireOperationalGatewayOrganization } from "../../middleware/tenant.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { sensitiveMutationRateLimit } from "../../middleware/sensitiveRateLimit.js";
import { routeParam } from "../../lib/routeParam.js";
import { writeLog } from "../../lib/logger.js";
import { getRequestId } from "../../lib/requestId.js";
import { getClientIp, getUserAgent } from "../auth/requestMeta.js";
import { actorFromRequest } from "../shared/actor.js";
import { actorFromGateway } from "./actor.js";
import { ingestGatewayEvent } from "./ingest.js";
import {
  bootstrapGateway,
  createDevice,
  createGateway,
  getGateway,
  listGateways,
  recordHeartbeat,
  revokeGateway,
  rotateGatewayCredential,
  setGatewayEnabled,
  testDeviceCommunication,
  updateDevice,
} from "./service.js";
import type { GatewayRequest } from "./types.js";
import {
  parseCreateDeviceInput,
  parseCreateGatewayInput,
  parseHeartbeatInput,
  parseUpdateDeviceInput,
} from "./validators.js";

export const gatewayRouter = Router();
export const edgeIngestRouter = Router();

gatewayRouter.use(requireAuthentication);

gatewayRouter.get("/", requirePermission("gateway.read", "weighbridge.manage"), async (request, response, next) => {
  try {
    const result = await listGateways(actorFromRequest(request));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/", sensitiveMutationRateLimit, requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const created = await createGateway(actorFromRequest(request), parseCreateGatewayInput(request.body));
    response.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

gatewayRouter.get("/:id", requirePermission("gateway.read", "weighbridge.manage"), async (request, response, next) => {
  try {
    const gateway = await getGateway(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ gateway });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/:id/enable", sensitiveMutationRateLimit, requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const gateway = await setGatewayEnabled(actorFromRequest(request), routeParam(request.params.id), true);
    response.status(200).json({ gateway });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/:id/disable", sensitiveMutationRateLimit, requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const gateway = await setGatewayEnabled(actorFromRequest(request), routeParam(request.params.id), false);
    response.status(200).json({ gateway });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/:id/revoke", sensitiveMutationRateLimit, requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const gateway = await revokeGateway(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ gateway });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/:id/rotate-credential", sensitiveMutationRateLimit, requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const result = await rotateGatewayCredential(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post("/:id/devices", requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const device = await createDevice(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseCreateDeviceInput(request.body),
    );
    response.status(201).json({ device });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.patch("/:id/devices/:deviceId", requirePermission("gateway.manage"), async (request, response, next) => {
  try {
    const device = await updateDevice(
      actorFromRequest(request),
      routeParam(request.params.id),
      routeParam(request.params.deviceId),
      parseUpdateDeviceInput(request.body),
    );
    response.status(200).json({ device });
  } catch (error) {
    next(error);
  }
});

gatewayRouter.post(
  "/:id/devices/:deviceId/test",
  requirePermission("gateway.manage", "gateway.read"),
  async (request, response, next) => {
    try {
      const result = await testDeviceCommunication(
        actorFromRequest(request),
        routeParam(request.params.id),
        routeParam(request.params.deviceId),
      );
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

edgeIngestRouter.use(requireGatewayAuth);

edgeIngestRouter.get("/bootstrap", async (request, response, next) => {
  try {
    const gateway = (request as GatewayRequest).gateway;
    const result = await bootstrapGateway(gateway.id, gateway.organizationId);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

edgeIngestRouter.post("/heartbeat", async (request, response, next) => {
  try {
    const gateway = (request as GatewayRequest).gateway;
    const result = await recordHeartbeat(gateway.id, gateway.organizationId, parseHeartbeatInput(request.body));
    response.status(200).json({ gateway: result });
  } catch (error) {
    next(error);
  }
});

edgeIngestRouter.post("/events", requireOperationalGatewayOrganization, async (request, response, next) => {
  try {
    const gateway = (request as GatewayRequest).gateway;
    const body = request.body as Record<string, unknown>;
    const actor = await actorFromGateway(gateway, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    const result = await ingestGatewayEvent(gateway, actor, request.body, {
      organizationId: body.organizationId,
      siteId: body.siteId,
    });
    writeLog("debug", "edge_event_ingest", {
      correlationId: getRequestId(request),
      gatewayId: gateway.id,
      eventId: result.eventId,
      eventType: result.eventType,
    });
    response.status(result.alreadyProcessed ? 200 : 201).json({ event: result });
  } catch (error) {
    next(error);
  }
});
