import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { skipReadsRequireOperationalOrganization, requireRequestedTenantScope } from "../../middleware/tenant.js";
import { requirePermission } from "../../middleware/authorize.js";
import { actorFromRequest } from "../shared/actor.js";
import {
  assignUnloading,
  completeUnloading,
  finalizeTransaction,
  listWeighments,
  recordWeighment,
  requestTransactionCorrection,
  startUnloading,
} from "./lifecycle.js";
import {
  createArrival,
  createTransaction,
  getTransaction,
  getTransactionTimeline,
  identifyTransaction,
  listTransactions,
} from "./service.js";
import { recordWeighmentFromDevice } from "./deviceWeighment.js";
import { assignTransactionMaterial, suggestTransactionMaterial, verifyTransactionMaterial } from "./materialWorkflow.js";
import { transactionDocumentRouter } from "../documents/routes.js";
import {
  parseAssignMaterialInput,
  parseAssignUnloadingInput,
  parseCompleteUnloadingInput,
  parseCorrectionInput,
  parseCreateTransactionInput,
  parseIdentifyInput,
  parseVerifyMaterialInput,
  parseWeighmentInput,
} from "./validators.js";

export const transactionRouter = Router();

transactionRouter.use(requireAuthentication);
transactionRouter.use(requireRequestedTenantScope);
transactionRouter.use(skipReadsRequireOperationalOrganization);

transactionRouter.get("/", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const result = await listTransactions(actorFromRequest(request), request.query as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

transactionRouter.post("/arrival", requirePermission("transaction.create"), async (request, response, next) => {
  try {
    const created = parseCreateTransactionInput(request.body);
    const identified = parseIdentifyInput(request.body);
    const transaction = await createArrival(actorFromRequest(request), {
      ...created,
      ...identified,
    });
    response.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
});

transactionRouter.post("/", requirePermission("transaction.create"), async (request, response, next) => {
  try {
    const transaction = await createTransaction(
      actorFromRequest(request),
      parseCreateTransactionInput(request.body),
    );
    response.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
});

transactionRouter.use("/:id/documents", transactionDocumentRouter);

transactionRouter.get("/:id", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const transaction = await getTransaction(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ transaction });
  } catch (error) {
    next(error);
  }
});

transactionRouter.post(
  "/:id/identify",
  requirePermission("transaction.update", "transaction.create"),
  async (request, response, next) => {
    try {
      const transaction = await identifyTransaction(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseIdentifyInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.get("/:id/timeline", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const timeline = await getTransactionTimeline(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json(timeline);
  } catch (error) {
    next(error);
  }
});

transactionRouter.get("/:id/workflow", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const transaction = await getTransaction(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({
      workflow: transaction.workflow,
      nextAction: transaction.nextAction,
      approval: transaction.approval,
      material: transaction.material,
    });
  } catch (error) {
    next(error);
  }
});

transactionRouter.get("/:id/next-action", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const transaction = await getTransaction(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json({ nextAction: transaction.nextAction, approval: transaction.approval });
  } catch (error) {
    next(error);
  }
});

transactionRouter.get("/:id/material", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const actor = actorFromRequest(request);
    const transactionId = routeParam(request.params.id);
    const transaction = await getTransaction(actor, transactionId);
    const suggestion = await suggestTransactionMaterial(actor, transactionId);
    response.status(200).json({
      material: transaction.material,
      identification: transaction.materialIdentification,
      suggestion,
    });
  } catch (error) {
    next(error);
  }
});

transactionRouter.post(
  "/:id/material",
  requirePermission("transaction.update", "transaction.create"),
  async (request, response, next) => {
    try {
      const transaction = await assignTransactionMaterial(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseAssignMaterialInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/material/verify",
  requirePermission("transaction.update", "document.verify"),
  async (request, response, next) => {
    try {
      const transaction = await verifyTransactionMaterial(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseVerifyMaterialInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.get("/:id/weighments", requirePermission("transaction.read"), async (request, response, next) => {
  try {
    const weighments = await listWeighments(actorFromRequest(request), routeParam(request.params.id));
    response.status(200).json(weighments);
  } catch (error) {
    next(error);
  }
});

transactionRouter.post(
  "/:id/weighments",
  requirePermission("weighment.record"),
  async (request, response, next) => {
    try {
      const transaction = await recordWeighment(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseWeighmentInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/weighments/from-device",
  requirePermission("weighment.record"),
  async (request, response, next) => {
    try {
      const kind =
        request.body && typeof request.body === "object" && "kind" in request.body
          ? request.body.kind
          : undefined;
      const transaction = await recordWeighmentFromDevice(
        actorFromRequest(request),
        routeParam(request.params.id),
        kind === "GROSS" || kind === "TARE" ? kind : undefined,
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/assign-unloading",
  requirePermission("unloading.assign"),
  async (request, response, next) => {
    try {
      const transaction = await assignUnloading(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseAssignUnloadingInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/start-unloading",
  requirePermission("unloading.manage"),
  async (request, response, next) => {
    try {
      const transaction = await startUnloading(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/complete-unloading",
  requirePermission("unloading.manage"),
  async (request, response, next) => {
    try {
      const transaction = await completeUnloading(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseCompleteUnloadingInput(request.body),
      );
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/finalize",
  requirePermission("transaction.finalize"),
  async (request, response, next) => {
    try {
      const transaction = await finalizeTransaction(actorFromRequest(request), routeParam(request.params.id));
      response.status(200).json({ transaction });
    } catch (error) {
      next(error);
    }
  },
);

transactionRouter.post(
  "/:id/corrections",
  requirePermission("transaction.correct"),
  async (request, response, next) => {
    try {
      const result = await requestTransactionCorrection(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseCorrectionInput(request.body),
      );
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },
);
