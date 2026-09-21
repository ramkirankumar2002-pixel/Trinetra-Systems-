import { Router } from "express";
import { env } from "../../config/env.js";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { skipReadsRequireOperationalOrganization } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { documentUploadRateLimit } from "../../middleware/resourceRateLimit.js";
import { actorFromRequest } from "../shared/actor.js";
import { parseDocumentUpload } from "./multipart.js";
import {
  getDocument,
  getDocumentFile,
  listConfiguredDocumentTypes,
  listTransactionDocuments,
  processDocument,
  reviewDocument,
  uploadDocument,
  verifyDocument,
} from "./service.js";
import { parseProcessDocumentInput, parseReviewDocumentInput, parseVerifyDocumentInput } from "./validators.js";

export const documentTypeRouter = Router();
export const documentRouter = Router();
export const transactionDocumentRouter = Router({ mergeParams: true });

documentTypeRouter.use(requireAuthentication);
documentRouter.use(requireAuthentication);
transactionDocumentRouter.use(requireAuthentication);
documentRouter.use(skipReadsRequireOperationalOrganization);
transactionDocumentRouter.use(skipReadsRequireOperationalOrganization);

documentTypeRouter.get("/", requirePermission("transaction.read", "document.upload"), (_request, response) => {
  response.status(200).json({ documentTypes: listConfiguredDocumentTypes(), configurable: true });
});

transactionDocumentRouter.get("/", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const result = await listTransactionDocuments(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

transactionDocumentRouter.post("/", documentUploadRateLimit, requirePermission("document.upload"), async (request, response, next) => {
  try {
    const parsed = await parseDocumentUpload(request, env.documentMaxBytes);
    const document = await uploadDocument(actorFromRequest(request), routeParam(request.params.id), {
      documentType: parsed.fields.documentType,
      file: parsed.file,
    });
    response.status(201).json({ document });
  } catch (error) {
    next(error);
  }
});

documentRouter.get("/:id", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const document = await getDocument(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ document });
  } catch (error) {
    next(error);
  }
});

documentRouter.get("/:id/file", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const file = await getDocumentFile(actorFromRequest(request), routeParam(request.params.id));
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="${sanitizeHeaderFileName(file.originalFileName)}"`);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "private, no-store");
    response.status(200).send(file.bytes);
  } catch (error) {
    next(error);
  }
});

documentRouter.post("/:id/process", requirePermission("document.upload"), async (request, response, next) => {
  try {
    const document = await processDocument(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseProcessDocumentInput(request.body),
    );
    response.status(200).json({ document, simulated: true });
  } catch (error) {
    next(error);
  }
});

documentRouter.get("/:id/ocr", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const document = await getDocument(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({
      documentId: document.id,
      ocrStatus: document.ocrStatus,
      simulated: document.simulatedOcr,
      ocr: document.ocr,
      vehicleComparison: document.vehicleComparison,
    });
  } catch (error) {
    next(error);
  }
});

documentRouter.patch("/:id/review", requirePermission("document.verify"), async (request, response, next) => {
  try {
    const document = await reviewDocument(
      actorFromRequest(request),
      routeParam(request.params.id),
      parseReviewDocumentInput(request.body),
    );
    response.status(200).json({ document });
  } catch (error) {
    next(error);
  }
});

documentRouter.patch(
  "/:id/verification",
  requirePermission("document.verify"),
  async (request, response, next) => {
    try {
      const document = await verifyDocument(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseVerifyDocumentInput(request.body),
      );
      response.status(200).json({ document });
    } catch (error) {
      next(error);
    }
  },
);

function sanitizeHeaderFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}
