import { HttpError } from "../../lib/httpError.js";
import { parsePagination } from "../../domain/pagination.js";
import {
  DEFAULT_INTEGRATION_SCOPES,
  isIntegrationEnvironment,
  isIntegrationScope,
  isIntegrationStatus,
  isTrinetraMappingField,
  isWebhookEventType,
  type IntegrationEnvironmentValue,
  type IntegrationScope,
  type IntegrationStatusValue,
  type WebhookEventType,
} from "../../domain/integration/index.js";

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Invalid request");
  }
  return body as Record<string, unknown>;
}

function requiredText(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is required`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }
  return trimmed;
}

function optionalText(value: unknown, field: string, max = 2000): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }
  return trimmed;
}

function parseScopes(value: unknown): IntegrationScope[] {
  if (value === undefined) {
    return [...DEFAULT_INTEGRATION_SCOPES];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "scopes must be an array of strings");
  }
  const scopes = [...new Set(value.map((item) => item.trim()))];
  if (scopes.some((scope) => !isIntegrationScope(scope))) {
    throw new HttpError(400, "One or more scopes are not supported");
  }
  return scopes as IntegrationScope[];
}

function parseSiteIds(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new HttpError(400, "siteIds must be an array of site identifiers");
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function parseEventTypes(value: unknown): WebhookEventType[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "eventTypes must be a non-empty array");
  }
  const events = [...new Set(value.map((item) => item.trim()))];
  if (events.some((item) => !isWebhookEventType(item))) {
    throw new HttpError(400, "One or more webhook event types are not supported");
  }
  return events as WebhookEventType[];
}

export type CreateApplicationInput = {
  name: string;
  description?: string | undefined;
  environment: IntegrationEnvironmentValue;
  scopes: IntegrationScope[];
  siteIds: string[];
  requestsPerMinute?: number | undefined;
  requestsPerHour?: number | undefined;
};

export function parseCreateApplicationInput(body: unknown): CreateApplicationInput {
  const record = asRecord(body);
  const environment = typeof record.environment === "string" ? record.environment : "TEST";
  if (!isIntegrationEnvironment(environment)) {
    throw new HttpError(400, "environment must be TEST or PRODUCTION");
  }
  return {
    name: requiredText(record.name, "name", 120),
    description: optionalText(record.description, "description"),
    environment,
    scopes: parseScopes(record.scopes),
    siteIds: parseSiteIds(record.siteIds),
    requestsPerMinute: optionalPositiveInt(record.requestsPerMinute, "requestsPerMinute"),
    requestsPerHour: optionalPositiveInt(record.requestsPerHour, "requestsPerHour"),
  };
}

export type UpdateApplicationInput = {
  name?: string | undefined;
  description?: string | undefined;
  status?: IntegrationStatusValue | undefined;
  scopes?: IntegrationScope[] | undefined;
  siteIds?: string[] | undefined;
  requestsPerMinute?: number | undefined;
  requestsPerHour?: number | undefined;
};

export function parseUpdateApplicationInput(body: unknown): UpdateApplicationInput {
  const record = asRecord(body);
  const status = typeof record.status === "string" ? record.status : undefined;
  if (status !== undefined && !isIntegrationStatus(status)) {
    throw new HttpError(400, "status must be ACTIVE, SUSPENDED, or REVOKED");
  }
  return {
    name: optionalText(record.name, "name", 120),
    description: optionalText(record.description, "description"),
    status,
    scopes: record.scopes === undefined ? undefined : parseScopes(record.scopes),
    siteIds: record.siteIds === undefined ? undefined : parseSiteIds(record.siteIds),
    requestsPerMinute: optionalPositiveInt(record.requestsPerMinute, "requestsPerMinute"),
    requestsPerHour: optionalPositiveInt(record.requestsPerHour, "requestsPerHour"),
  };
}

export function parseCreateCredentialInput(body: unknown): { expiresAt?: Date | undefined } {
  const record = asRecord(body);
  return { expiresAt: optionalDate(record.expiresAt, "expiresAt") };
}

export function parseCreateWebhookInput(body: unknown): { url: string; eventTypes: WebhookEventType[] } {
  const record = asRecord(body);
  return {
    url: requiredText(record.url, "url", 2000),
    eventTypes: parseEventTypes(record.eventTypes),
  };
}

export function parseUpdateWebhookInput(body: unknown): {
  url?: string | undefined;
  eventTypes?: WebhookEventType[] | undefined;
  status?: "ACTIVE" | "DISABLED" | "REVOKED" | undefined;
} {
  const record = asRecord(body);
  const status = typeof record.status === "string" ? record.status : undefined;
  if (status !== undefined && status !== "ACTIVE" && status !== "DISABLED" && status !== "REVOKED") {
    throw new HttpError(400, "status must be ACTIVE, DISABLED, or REVOKED");
  }
  return {
    url: optionalText(record.url, "url", 2000),
    eventTypes: record.eventTypes === undefined ? undefined : parseEventTypes(record.eventTypes),
    status,
  };
}

export function parseExternalReferenceInput(body: unknown): {
  entityType: string;
  entityId: string;
  externalType: "ERP_TRANSACTION" | "PURCHASE_ORDER" | "DELIVERY_REFERENCE" | "SUPPLIER" | "CUSTOM";
  externalId: string;
} {
  const record = asRecord(body);
  const externalType = requiredText(record.externalType, "externalType");
  if (
    externalType !== "ERP_TRANSACTION" &&
    externalType !== "PURCHASE_ORDER" &&
    externalType !== "DELIVERY_REFERENCE" &&
    externalType !== "SUPPLIER" &&
    externalType !== "CUSTOM"
  ) {
    throw new HttpError(400, "externalType is not supported");
  }
  return {
    entityType: requiredText(record.entityType, "entityType", 80),
    entityId: requiredText(record.entityId, "entityId", 80),
    externalType,
    externalId: requiredText(record.externalId, "externalId", 200),
  };
}

export function parseFieldMappingInput(body: unknown): { externalField: string; trinetraField: string; notes?: string | undefined } {
  const record = asRecord(body);
  const trinetraField = requiredText(record.trinetraField, "trinetraField", 80);
  if (!isTrinetraMappingField(trinetraField)) {
    throw new HttpError(400, "trinetraField is not a supported mapping target");
  }
  return {
    externalField: requiredText(record.externalField, "externalField", 80),
    trinetraField,
    notes: optionalText(record.notes, "notes", 500),
  };
}

export function parseListQuery(query: Record<string, unknown>) {
  return {
    pagination: parsePagination(query, { pageSize: 20, maxPageSize: 100 }),
    q: typeof query.q === "string" ? query.q.trim() : "",
    status: typeof query.status === "string" ? query.status : "",
    siteId: typeof query.siteId === "string" ? query.siteId : "",
    updatedSince: optionalDate(query.updatedSince, "updatedSince"),
    from: optionalDate(query.from, "from"),
    to: optionalDate(query.to, "to"),
  };
}

function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

function optionalDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new HttpError(400, `${field} must be an ISO-8601 timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field} must be an ISO-8601 timestamp`);
  }
  return date;
}
