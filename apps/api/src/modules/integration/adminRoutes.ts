import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { skipReadsRequireOperationalOrganization } from "../../middleware/tenant.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  createApplication,
  getApplication,
  listApplications,
  updateApplication,
} from "./applications.js";
import { createCredential, listCredentials, revokeCredential, rotateCredential } from "./credentials.js";
import { integrationOverview } from "./dashboard.js";
import { deleteFieldMapping, listFieldMappings, upsertFieldMapping } from "./mappings.js";
import { listUsage } from "./logs.js";
import { integrationCatalog } from "./resources.js";
import {
  createWebhook,
  listDeliveries,
  listWebhooks,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from "./webhooks.js";
import {
  parseCreateApplicationInput,
  parseCreateCredentialInput,
  parseCreateWebhookInput,
  parseFieldMappingInput,
  parseUpdateApplicationInput,
  parseUpdateWebhookInput,
} from "./validators.js";

export const integrationAdminRouter = Router();

integrationAdminRouter.use(requireAuthentication);
integrationAdminRouter.use(skipReadsRequireOperationalOrganization);

integrationAdminRouter.get("/catalog", requirePermission("integration.read", "integration.manage"), (_request, response) => {
  response.status(200).json(integrationCatalog());
});

integrationAdminRouter.get("/overview", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await integrationOverview(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/applications", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listApplications(actorFromRequest(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/applications", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    const result = await createApplication(actorFromRequest(request), parseCreateApplicationInput(request.body));
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/applications/:id", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await getApplication(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.patch("/applications/:id", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await updateApplication(actorFromRequest(request), routeParam(request.params.id), parseUpdateApplicationInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/applications/:id/credentials", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listCredentials(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/applications/:id/credentials", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    const result = await createCredential(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseCreateCredentialInput(request.body ?? {}),
    );
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/credentials/:id/rotate", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(201).json(await rotateCredential(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/credentials/:id/revoke", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await revokeCredential(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/applications/:id/webhooks", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listWebhooks(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/applications/:id/webhooks", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    const result = await createWebhook(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseCreateWebhookInput(request.body),
    );
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.patch("/webhooks/:id", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await updateWebhook(actorFromRequest(request), routeParam(request.params.id), parseUpdateWebhookInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/webhooks/:id/rotate-secret", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(201).json(await rotateWebhookSecret(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.post("/webhooks/:id/test", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await testWebhook(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/deliveries", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listDeliveries(actorFromRequest(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/usage", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listUsage(actorFromRequest(request), request.query as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.get("/applications/:id/mappings", requirePermission("integration.read", "integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listFieldMappings(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.put("/applications/:id/mappings", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await upsertFieldMapping(actorFromRequest(request), routeParam(request.params.id), parseFieldMappingInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

integrationAdminRouter.delete("/mappings/:id", requirePermission("integration.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await deleteFieldMapping(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});
