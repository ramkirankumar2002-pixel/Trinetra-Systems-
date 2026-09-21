import { Router } from "express";
import { routeParam } from "../../lib/routeParam.js";
import { requireAuthentication } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/authorize.js";
import { skipReadsRequireOperationalOrganization } from "../../middleware/tenant.js";
import { actorFromRequest } from "../shared/actor.js";
import { deviceServiceHistory, supportDashboard, weighbridgeServiceHistory } from "./dashboard.js";
import {
  cancelServiceMaintenance,
  completeServiceMaintenance,
  createMaintenance,
  getMaintenance,
  listMaintenance,
  startServiceMaintenance,
  updateMaintenance,
} from "./maintenance.js";
import {
  addTicketComment,
  assignTicket,
  changeTicketPriority,
  closeTicket,
  createTicket,
  getTicket,
  listAssignees,
  listTickets,
  supportCatalog,
  transitionTicket,
  updateTicket,
} from "./tickets.js";
import {
  parseAssignTicketInput,
  parseCompleteMaintenanceInput,
  parseCreateMaintenanceInput,
  parseCreateTicketInput,
  parseDashboardQuery,
  parseMaintenanceListQuery,
  parsePriorityInput,
  parseStatusTransitionInput,
  parseTicketCommentInput,
  parseTicketListQuery,
  parseUpdateMaintenanceInput,
  parseUpdateTicketInput,
} from "./validators.js";

export const supportRouter = Router();

supportRouter.use(requireAuthentication);
supportRouter.use(skipReadsRequireOperationalOrganization);

supportRouter.get("/catalog", requirePermission("support.ticket.read", "support.maintenance.read"), async (_request, response, next) => {
  try {
    response.status(200).json(await supportCatalog());
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/dashboard", requirePermission("support.ticket.read", "support.maintenance.read"), async (request, response, next) => {
  try {
    response.status(200).json(await supportDashboard(actorFromRequest(request), parseDashboardQuery(request.query as Record<string, unknown>)));
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/assignees", requirePermission("support.ticket.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await listAssignees(actorFromRequest(request)));
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/tickets", requirePermission("support.ticket.read"), async (request, response, next) => {
  try {
    response.status(200).json(await listTickets(actorFromRequest(request), parseTicketListQuery(request.query as Record<string, unknown>)));
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets", requirePermission("support.ticket.create"), async (request, response, next) => {
  try {
    response.status(201).json(await createTicket(actorFromRequest(request), parseCreateTicketInput(request.body)));
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/tickets/:id", requirePermission("support.ticket.read"), async (request, response, next) => {
  try {
    response.status(200).json(await getTicket(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

supportRouter.patch("/tickets/:id", requirePermission("support.ticket.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await updateTicket(actorFromRequest(request), routeParam(request.params.id), parseUpdateTicketInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets/:id/assign", requirePermission("support.ticket.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await assignTicket(actorFromRequest(request), routeParam(request.params.id), parseAssignTicketInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets/:id/priority", requirePermission("support.ticket.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await changeTicketPriority(actorFromRequest(request), routeParam(request.params.id), parsePriorityInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets/:id/status", requirePermission("support.ticket.manage", "support.ticket.comment"), async (request, response, next) => {
  try {
    response.status(200).json(
      await transitionTicket(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseStatusTransitionInput(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets/:id/close", requirePermission("support.ticket.manage", "support.ticket.comment"), async (request, response, next) => {
  try {
    const body = typeof request.body === "object" && request.body !== null ? (request.body as Record<string, unknown>) : {};
    response.status(200).json(
      await closeTicket(actorFromRequest(request), routeParam(request.params.id), {
        resolutionSummary: typeof body.resolutionSummary === "string" ? body.resolutionSummary : undefined,
      }),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/tickets/:id/comments", requirePermission("support.ticket.comment"), async (request, response, next) => {
  try {
    response.status(200).json(
      await addTicketComment(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseTicketCommentInput(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/maintenance", requirePermission("support.maintenance.read"), async (request, response, next) => {
  try {
    response.status(200).json(
      await listMaintenance(actorFromRequest(request), parseMaintenanceListQuery(request.query as Record<string, unknown>)),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/maintenance", requirePermission("support.maintenance.manage"), async (request, response, next) => {
  try {
    response.status(201).json(
      await createMaintenance(actorFromRequest(request), parseCreateMaintenanceInput(request.body)),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/maintenance/:id", requirePermission("support.maintenance.read"), async (request, response, next) => {
  try {
    response.status(200).json(await getMaintenance(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

supportRouter.patch("/maintenance/:id", requirePermission("support.maintenance.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await updateMaintenance(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseUpdateMaintenanceInput(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/maintenance/:id/start", requirePermission("support.maintenance.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await startServiceMaintenance(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/maintenance/:id/complete", requirePermission("support.maintenance.manage"), async (request, response, next) => {
  try {
    response.status(200).json(
      await completeServiceMaintenance(
        actorFromRequest(request),
        routeParam(request.params.id),
        parseCompleteMaintenanceInput(request.body),
      ),
    );
  } catch (error) {
    next(error);
  }
});

supportRouter.post("/maintenance/:id/cancel", requirePermission("support.maintenance.manage"), async (request, response, next) => {
  try {
    response.status(200).json(await cancelServiceMaintenance(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/devices/:id/history", requirePermission("support.ticket.read", "support.maintenance.read", "gateway.read"), async (request, response, next) => {
  try {
    response.status(200).json(await deviceServiceHistory(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});

supportRouter.get("/weighbridges/:id/history", requirePermission("support.ticket.read", "support.maintenance.read", "weighbridge.read"), async (request, response, next) => {
  try {
    response.status(200).json(await weighbridgeServiceHistory(actorFromRequest(request), routeParam(request.params.id)));
  } catch (error) {
    next(error);
  }
});
