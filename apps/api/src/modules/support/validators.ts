import {
  isServiceMaintenanceStatus,
  isServiceMaintenanceType,
  isSupportTicketCategory,
  isSupportTicketPriority,
  isSupportTicketStatus,
  type ServiceMaintenanceStatus,
  type ServiceMaintenanceType,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from "../../domain/support/index.js";
import { parsePagination, type Pagination } from "../../domain/pagination.js";
import { HttpError } from "../../lib/httpError.js";

export type CreateTicketInput = {
  siteId: string;
  subject: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  weighbridgeId?: string | undefined;
  gatewayId?: string | undefined;
  deviceId?: string | undefined;
  transactionId?: string | undefined;
  securityEventId?: string | undefined;
  operationalAlertId?: string | undefined;
  weightAnomalyEventId?: string | undefined;
};

export type TicketListQuery = {
  pagination: Pagination;
  q?: string | undefined;
  siteId?: string | undefined;
  weighbridgeId?: string | undefined;
  deviceId?: string | undefined;
  gatewayId?: string | undefined;
  status?: SupportTicketStatus | undefined;
  priority?: SupportTicketPriority | undefined;
  category?: SupportTicketCategory | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

export type UpdateTicketInput = {
  subject?: string | undefined;
  description?: string | undefined;
  weighbridgeId?: string | null | undefined;
  gatewayId?: string | null | undefined;
  deviceId?: string | null | undefined;
  transactionId?: string | null | undefined;
};

export type AssignTicketInput = {
  assignedUserId?: string | null | undefined;
  assignedTeam?: string | null | undefined;
};

export type TicketCommentInput = {
  body: string;
  internal: boolean;
};

export type StatusTransitionInput = {
  status: SupportTicketStatus;
  expectedStatus?: SupportTicketStatus | undefined;
  resolutionSummary?: string | undefined;
};

export type CreateMaintenanceInput = {
  siteId: string;
  type: ServiceMaintenanceType;
  reason: string;
  description: string;
  weighbridgeId?: string | undefined;
  gatewayId?: string | undefined;
  deviceId?: string | undefined;
  ticketId?: string | undefined;
  securityEventId?: string | undefined;
  operationalAlertId?: string | undefined;
  startNow?: boolean | undefined;
};

export type UpdateMaintenanceInput = {
  reason?: string | undefined;
  description?: string | undefined;
  findings?: string | undefined;
  actionTaken?: string | undefined;
  partsReplaced?: string | undefined;
  beforeCondition?: string | undefined;
  afterCondition?: string | undefined;
  weighbridgeId?: string | null | undefined;
  gatewayId?: string | null | undefined;
  deviceId?: string | null | undefined;
  ticketId?: string | null | undefined;
};

export type CompleteMaintenanceInput = {
  findings?: string | undefined;
  actionTaken?: string | undefined;
  partsReplaced?: string | undefined;
  afterCondition?: string | undefined;
};

export type MaintenanceListQuery = {
  pagination: Pagination;
  q?: string | undefined;
  siteId?: string | undefined;
  weighbridgeId?: string | undefined;
  deviceId?: string | undefined;
  gatewayId?: string | undefined;
  status?: ServiceMaintenanceStatus | undefined;
  type?: ServiceMaintenanceType | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

export function parseCreateTicketInput(body: unknown): CreateTicketInput {
  const record = asObject(body);
  return {
    siteId: requiredId(record.siteId, "siteId"),
    subject: requiredText(record.subject, "subject", 200),
    description: requiredText(record.description, "description", 4000),
    category: parseEnum(record.category, "category", isSupportTicketCategory),
    priority: optionalEnum(record.priority, "priority", isSupportTicketPriority) ?? "MEDIUM",
    weighbridgeId: optionalId(record.weighbridgeId, "weighbridgeId"),
    gatewayId: optionalId(record.gatewayId, "gatewayId"),
    deviceId: optionalId(record.deviceId, "deviceId"),
    transactionId: optionalId(record.transactionId, "transactionId"),
    securityEventId: optionalId(record.securityEventId, "securityEventId"),
    operationalAlertId: optionalId(record.operationalAlertId, "operationalAlertId"),
    weightAnomalyEventId: optionalId(record.weightAnomalyEventId, "weightAnomalyEventId"),
  };
}

export function parseTicketListQuery(query: Record<string, unknown>): TicketListQuery {
  return {
    pagination: parsePagination(query),
    q: optionalText(query.q, "q", 120),
    siteId: optionalId(query.siteId, "siteId"),
    weighbridgeId: optionalId(query.weighbridgeId, "weighbridgeId"),
    deviceId: optionalId(query.deviceId, "deviceId"),
    gatewayId: optionalId(query.gatewayId, "gatewayId"),
    status: optionalEnum(query.status, "status", isSupportTicketStatus),
    priority: optionalEnum(query.priority, "priority", isSupportTicketPriority),
    category: optionalEnum(query.category, "category", isSupportTicketCategory),
    from: optionalDate(query.from, "from"),
    to: optionalDate(query.to, "to"),
  };
}

export function parseUpdateTicketInput(body: unknown): UpdateTicketInput {
  const record = asObject(body);
  return {
    subject: optionalText(record.subject, "subject", 200),
    description: optionalText(record.description, "description", 4000),
    weighbridgeId: nullableId(record.weighbridgeId, "weighbridgeId"),
    gatewayId: nullableId(record.gatewayId, "gatewayId"),
    deviceId: nullableId(record.deviceId, "deviceId"),
    transactionId: nullableId(record.transactionId, "transactionId"),
  };
}

export function parseAssignTicketInput(body: unknown): AssignTicketInput {
  const record = asObject(body);
  return {
    assignedUserId: nullableId(record.assignedUserId, "assignedUserId"),
    assignedTeam: nullableText(record.assignedTeam, "assignedTeam", 80),
  };
}

export function parseTicketCommentInput(body: unknown): TicketCommentInput {
  const record = asObject(body);
  return {
    body: requiredText(record.body ?? record.description, "body", 4000),
    internal: record.internal === true,
  };
}

export function parseStatusTransitionInput(body: unknown): StatusTransitionInput {
  const record = asObject(body);
  return {
    status: parseEnum(record.status, "status", isSupportTicketStatus),
    expectedStatus: optionalEnum(record.expectedStatus, "expectedStatus", isSupportTicketStatus),
    resolutionSummary: optionalText(record.resolutionSummary, "resolutionSummary", 2000),
  };
}

export function parsePriorityInput(body: unknown): SupportTicketPriority {
  return parseEnum(asObject(body).priority, "priority", isSupportTicketPriority);
}

export function parseCreateMaintenanceInput(body: unknown): CreateMaintenanceInput {
  const record = asObject(body);
  return {
    siteId: requiredId(record.siteId, "siteId"),
    type: parseEnum(record.type, "type", isServiceMaintenanceType),
    reason: requiredText(record.reason, "reason", 200),
    description: requiredText(record.description, "description", 4000),
    weighbridgeId: optionalId(record.weighbridgeId, "weighbridgeId"),
    gatewayId: optionalId(record.gatewayId, "gatewayId"),
    deviceId: optionalId(record.deviceId, "deviceId"),
    ticketId: optionalId(record.ticketId, "ticketId"),
    securityEventId: optionalId(record.securityEventId, "securityEventId"),
    operationalAlertId: optionalId(record.operationalAlertId, "operationalAlertId"),
    startNow: record.startNow === true,
  };
}

export function parseUpdateMaintenanceInput(body: unknown): UpdateMaintenanceInput {
  const record = asObject(body);
  return {
    reason: optionalText(record.reason, "reason", 200),
    description: optionalText(record.description, "description", 4000),
    findings: optionalText(record.findings, "findings", 4000),
    actionTaken: optionalText(record.actionTaken, "actionTaken", 4000),
    partsReplaced: optionalText(record.partsReplaced, "partsReplaced", 2000),
    beforeCondition: optionalText(record.beforeCondition, "beforeCondition", 2000),
    afterCondition: optionalText(record.afterCondition, "afterCondition", 2000),
    weighbridgeId: nullableId(record.weighbridgeId, "weighbridgeId"),
    gatewayId: nullableId(record.gatewayId, "gatewayId"),
    deviceId: nullableId(record.deviceId, "deviceId"),
    ticketId: nullableId(record.ticketId, "ticketId"),
  };
}

export function parseCompleteMaintenanceInput(body: unknown): CompleteMaintenanceInput {
  const record = asObject(body ?? {});
  return {
    findings: optionalText(record.findings, "findings", 4000),
    actionTaken: optionalText(record.actionTaken, "actionTaken", 4000),
    partsReplaced: optionalText(record.partsReplaced, "partsReplaced", 2000),
    afterCondition: optionalText(record.afterCondition, "afterCondition", 2000),
  };
}

export function parseMaintenanceListQuery(query: Record<string, unknown>): MaintenanceListQuery {
  return {
    pagination: parsePagination(query),
    q: optionalText(query.q, "q", 120),
    siteId: optionalId(query.siteId, "siteId"),
    weighbridgeId: optionalId(query.weighbridgeId, "weighbridgeId"),
    deviceId: optionalId(query.deviceId, "deviceId"),
    gatewayId: optionalId(query.gatewayId, "gatewayId"),
    status: optionalEnum(query.status, "status", isServiceMaintenanceStatus),
    type: optionalEnum(query.type, "type", isServiceMaintenanceType),
    from: optionalDate(query.from, "from"),
    to: optionalDate(query.to, "to"),
  };
}

export function parseDashboardQuery(query: Record<string, unknown>): {
  siteId?: string | undefined;
  weighbridgeId?: string | undefined;
  deviceId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
} {
  return {
    siteId: optionalId(query.siteId, "siteId"),
    weighbridgeId: optionalId(query.weighbridgeId, "weighbridgeId"),
    deviceId: optionalId(query.deviceId, "deviceId"),
    from: optionalDate(query.from, "from"),
    to: optionalDate(query.to, "to"),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(400, "Request body must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, max: number): string {
  const text = optionalText(value, field, max);
  if (!text) {
    throw new HttpError(400, `${field} is required`);
  }
  return text;
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be text`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }
  return trimmed;
}

function nullableText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalText(value, field, max);
}

function requiredId(value: unknown, field: string): string {
  const id = optionalId(value, field);
  if (!id) {
    throw new HttpError(400, `${field} is required`);
  }
  return id;
}

function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is invalid`);
  }
  return value.trim();
}

function nullableId(value: unknown, field: string): string | null | undefined {
  if (value === null) {
    return null;
  }
  return optionalId(value, field);
}

function parseEnum<T extends string>(
  value: unknown,
  field: string,
  guard: (candidate: string) => candidate is T,
): T {
  const parsed = optionalEnum(value, field, guard);
  if (!parsed) {
    throw new HttpError(400, `${field} is invalid`);
  }
  return parsed;
}

function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  guard: (candidate: string) => candidate is T,
): T | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !guard(value)) {
    throw new HttpError(400, `${field} is invalid`);
  }
  return value;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a date`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${field} must be a date`);
  }
  return parsed;
}
