import { Router } from "express";
import type { Request, Response } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { actorFromIntegration } from "./actor.js";
import { getClientIp, getUserAgent } from "../auth/requestMeta.js";
import {
  requireIntegrationAuth,
  requireIntegrationScope,
  requireIntegrationWrite,
} from "./middleware.js";
import {
  createExternalReference,
  listExternalReferences,
} from "./references.js";
import {
  createIntegrationVehicle,
  documentWriteNotAllowed,
  getIntegrationDocument,
  getIntegrationDocumentFile,
  getIntegrationMaterial,
  getIntegrationTransaction,
  getIntegrationVehicle,
  getOrganization,
  listIntegrationDevices,
  listIntegrationDocuments,
  listIntegrationEvents,
  listIntegrationMaterials,
  listIntegrationNotifications,
  listIntegrationReports,
  listIntegrationTransactions,
  listIntegrationVehicles,
  listIntegrationWeighbridges,
  listIntegrationWeighments,
  listSites,
  updateIntegrationVehicle,
} from "./resources.js";
import { parseExternalReferenceInput } from "./validators.js";
import {
  readIdempotencyKey,
  replayOrBegin,
  requestFingerprint,
  storeIdempotentResult,
} from "./idempotency.js";
import type { IntegrationRequest } from "./types.js";

export const integrationExtRouter = Router();

integrationExtRouter.use(requireIntegrationAuth);

function integrationActor(request: Request) {
  const authed = request as IntegrationRequest;
  if (!authed.integration) {
    throw new Error("Missing integration auth");
  }
  return actorFromIntegration(authed.integration, getClientIp(request), getUserAgent(request));
}

async function withIdempotency(
  request: Request,
  response: Response,
  endpoint: string,
  run: () => Promise<{ status: number; body: Record<string, unknown> }>,
): Promise<void> {
  const authed = request as IntegrationRequest;
  if (!authed.integration) {
    throw new Error("Missing integration auth");
  }
  const key = readIdempotencyKey(request.header("idempotency-key") ?? undefined);
  const fingerprint = requestFingerprint(request.method, endpoint, request.body);
  if (key) {
    const replay = await replayOrBegin(authed.integration, endpoint, key, fingerprint, response);
    if (replay === "replayed") {
      return;
    }
  }
  const result = await run();
  if (key) {
    await storeIdempotentResult(
      authed.integration,
      endpoint,
      key,
      fingerprint,
      result.status,
      JSON.parse(JSON.stringify(result.body)),
    );
  }
  response.status(result.status).json(result.body);
}

integrationExtRouter.get("/organization", requireIntegrationScope("ORGANIZATION_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await getOrganization(integrationActor(request)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/sites", requireIntegrationScope("ORGANIZATION_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listSites(integrationActor(request)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/transactions", requireIntegrationScope("TRANSACTIONS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationTransactions(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/transactions/:id", requireIntegrationScope("TRANSACTIONS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await getIntegrationTransaction(integrationActor(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/weighments", requireIntegrationScope("WEIGHMENTS_READ", "TRANSACTIONS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationWeighments(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/vehicles", requireIntegrationScope("VEHICLES_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationVehicles(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/vehicles/:id", requireIntegrationScope("VEHICLES_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await getIntegrationVehicle(integrationActor(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.post("/vehicles", requireIntegrationWrite, requireIntegrationScope("VEHICLES_WRITE"), async (request, response, next) => {
  try {
    await withIdempotency(request, response, "POST /vehicles", async () => ({
      status: 201,
      body: await createIntegrationVehicle(integrationActor(request), request.body),
    }));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.patch("/vehicles/:id", requireIntegrationWrite, requireIntegrationScope("VEHICLES_WRITE"), async (request, response, next) => {
  try {
    const id = routeParam(request.params.id);
    await withIdempotency(request, response, `PATCH /vehicles/${id}`, async () => ({
      status: 200,
      body: await updateIntegrationVehicle(integrationActor(request), id, request.body),
    }));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/materials", requireIntegrationScope("MATERIALS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationMaterials(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/materials/:id", requireIntegrationScope("MATERIALS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await getIntegrationMaterial(integrationActor(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/weighbridges", requireIntegrationScope("WEIGHBRIDGES_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationWeighbridges(integrationActor(request)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/devices", requireIntegrationScope("DEVICES_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationDevices(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/events", requireIntegrationScope("EVENTS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationEvents(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/documents", requireIntegrationScope("DOCUMENTS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationDocuments(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/documents/:id", requireIntegrationScope("DOCUMENTS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await getIntegrationDocument(integrationActor(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/documents/:id/file", requireIntegrationScope("DOCUMENTS_READ"), async (request, response, next) => {
  try {
    const file = await getIntegrationDocumentFile(integrationActor(request), routeParam(request.params.id));
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${file.originalFileName.replaceAll('"', "")}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).send(file.bytes);
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.post("/documents", requireIntegrationScope("DOCUMENTS_WRITE"), (_request, _response, next) => {
  try {
    documentWriteNotAllowed();
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/reports/transactions", requireIntegrationScope("REPORTS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationReports(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/notifications", requireIntegrationScope("NOTIFICATIONS_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listIntegrationNotifications(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.get("/references", requireIntegrationScope("TRANSACTIONS_READ", "VEHICLES_READ"), async (request, response, next) => {
  try {
    response.status(200).json(await listExternalReferences(integrationActor(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationExtRouter.post("/references", requireIntegrationWrite, requireIntegrationScope("TRANSACTIONS_WRITE", "VEHICLES_WRITE"), async (request, response, next) => {
  try {
    await withIdempotency(request, response, "POST /references", async () => ({
      status: 201,
      body: await createExternalReference(integrationActor(request), parseExternalReferenceInput(request.body)),
    }));
  } catch (error) {
    next(error);
  }
});
