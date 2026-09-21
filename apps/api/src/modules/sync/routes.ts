import { Router } from "express";
import { requireAuthentication } from "../../middleware/auth.js";
import { requireGatewayAuth } from "../../middleware/gatewayAuth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { routeParam } from "../../lib/routeParam.js";
import { getClientIp, getUserAgent } from "../auth/requestMeta.js";
import { actorFromGateway } from "../edge/actor.js";
import type { GatewayRequest } from "../edge/types.js";
import { actorFromRequest } from "../shared/actor.js";
import { ingestSyncBatch } from "./batch.js";
import { storeSyncedFile } from "./files.js";
import {
  acknowledgeConflict,
  listDeadLetters,
  listSyncConflicts,
  listSyncDashboard,
  resolveConflict,
} from "./service.js";
import { parseFileUploadInput, parseResolutionNote, parseSyncBatchInput } from "./validators.js";

export const syncRouter = Router();
export const edgeSyncRouter = Router();

syncRouter.use(requireAuthentication);

syncRouter.get("/", requirePermission("sync.read", "gateway.read"), async (request, response, next) => {
  try {
    response.status(200).json(await listSyncDashboard(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

syncRouter.get("/conflicts", requirePermission("sync.read", "gateway.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listSyncConflicts(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

syncRouter.get("/dead-letters", requirePermission("sync.manage", "gateway.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listDeadLetters(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

syncRouter.post(
  "/conflicts/:id/acknowledge",
  requirePermission("sync.manage", "gateway.manage"),
  async (request, response, next) => {
    try {
      const conflict = await acknowledgeConflict(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ conflict });
    } catch (error) {
      next(error);
    }
  },
);

syncRouter.post(
  "/conflicts/:id/resolve",
  requirePermission("sync.manage", "gateway.manage"),
  async (request, response, next) => {
    try {
      const conflict = await resolveConflict(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseResolutionNote(request.body),
      );
      response.status(200).json({ conflict });
    } catch (error) {
      next(error);
    }
  },
);

edgeSyncRouter.use(requireGatewayAuth);

edgeSyncRouter.post("/batch", async (request, response, next) => {
  try {
    const gateway = (request as GatewayRequest).gateway;
    const actor = await actorFromGateway(gateway, {
      ipAddress: getClientIp(request),
      userAgent: getUserAgent(request),
    });
    const parsed = parseSyncBatchInput(request.body);
    const result = await ingestSyncBatch(gateway, actor, parsed.events, parsed.snapshot);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

edgeSyncRouter.post("/files", async (request, response, next) => {
  try {
    const gateway = (request as GatewayRequest).gateway;
    const stored = await storeSyncedFile(gateway, parseFileUploadInput(request.body));
    response.status(stored.alreadyProcessed ? 200 : 201).json(stored);
  } catch (error) {
    next(error);
  }
});
