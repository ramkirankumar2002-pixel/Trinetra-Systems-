import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import {
  API_VERSION,
  CURRENT_API_VERSION,
  DEFAULT_INTEGRATION_SCOPES,
  INTEGRATION_ENVIRONMENTS,
  INTEGRATION_SCOPES,
  INTEGRATION_STATUSES,
  TRINETRA_MAPPING_FIELDS,
  WEBHOOK_EVENT_TYPES,
} from "../../domain/integration/index.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { reportTransactions } from "../dashboard/service.js";
import { documentInclude, toPublicDocument, type PublicDocument } from "../documents/mapper.js";
import { getDocument, getDocumentFile, listTransactionDocuments } from "../documents/service.js";
import { toPublicDevice } from "../edge/mapper.js";
import { listMaterials, getMaterial } from "../materials/service.js";
import { listOperationalAlerts } from "../notifications/alerts.js";
import { accessibleSiteIds, accessibleSiteWhere, assertRequestedSite } from "../shared/siteScope.js";
import { toPublicTransaction, transactionInclude } from "../transactions/mapper.js";
import { listAccessibleSites } from "../unloadingPoints/service.js";
import {
  createVehicle,
  getVehicle,
  listVehicles,
  updateVehicle,
} from "../vehicles/service.js";
import { parseVehicleCreateInput, parseVehicleUpdateInput } from "../vehicles/validators.js";
import { listWeighbridges } from "../weighbridges/service.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { IntegrationActor } from "./types.js";
import { parseListQuery } from "./validators.js";

export function integrationCatalog() {
  return {
    apiVersion: API_VERSION,
    currentVersion: CURRENT_API_VERSION,
    statuses: [...INTEGRATION_STATUSES],
    environments: [...INTEGRATION_ENVIRONMENTS],
    scopes: [...INTEGRATION_SCOPES],
    defaultScopes: [...DEFAULT_INTEGRATION_SCOPES],
    webhookEventTypes: [...WEBHOOK_EVENT_TYPES],
    mappingFields: [...TRINETRA_MAPPING_FIELDS],
    rateLimits: { defaultRequestsPerMinute: 60, defaultRequestsPerHour: 1200 },
  };
}

export async function getOrganization(actor: IntegrationActor) {
  return {
    organization: {
      id: actor.user.organization.id,
      name: actor.user.organization.name,
      slug: actor.user.organization.slug,
      status: actor.user.organization.status,
      kind: actor.user.organization.kind,
    },
    integration: {
      id: actor.integration.applicationId,
      name: actor.integration.applicationName,
      environment: actor.integration.environment,
      scopes: actor.integration.scopes,
      siteIds: actor.integration.siteIds,
    },
  };
}

export async function listSites(actor: IntegrationActor) {
  return listAccessibleSites(actor);
}

export async function listIntegrationTransactions(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  if (parsed.siteId) {
    await assertRequestedSite(actor, parsed.siteId);
  }
  const where: Prisma.TransactionWhereInput = {
    organizationId: actor.user.organizationId,
    ...accessibleSiteWhere(actor),
    ...(parsed.siteId ? { siteId: parsed.siteId } : {}),
    ...(parsed.updatedSince ? { updatedAt: { gte: parsed.updatedSince } } : {}),
    ...(parsed.from || parsed.to
      ? {
          arrivedAt: {
            ...(parsed.from ? { gte: parsed.from } : {}),
            ...(parsed.to ? { lte: parsed.to } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: { updatedAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => toPublicTransaction(row)),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
    timezone: "UTC",
    timestampField: parsed.updatedSince ? "updatedAt" : "arrivedAt",
  };
}

export async function getIntegrationTransaction(actor: IntegrationActor, id: string) {
  const record = await prisma.transaction.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });
  if (!record) {
    throw new HttpError(404, "Transaction not found");
  }
  assertSiteAccess(actor.user, record.siteId);
  return { transaction: toPublicTransaction(record) };
}

export async function listIntegrationWeighments(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const transactionId = typeof query.transactionId === "string" ? query.transactionId : "";
  const where: Prisma.WeighmentWhereInput = {
    transaction: {
      organizationId: actor.user.organizationId,
      ...accessibleSiteWhere(actor),
      ...(parsed.siteId ? { siteId: parsed.siteId } : {}),
      ...(transactionId ? { id: transactionId } : {}),
    },
    ...(parsed.updatedSince ? { recordedAt: { gte: parsed.updatedSince } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.weighment.count({ where }),
    prisma.weighment.findMany({
      where,
      select: {
        id: true,
        transactionId: true,
        sequence: true,
        kind: true,
        weightKg: true,
        recordedAt: true,
        source: true,
        transaction: { select: { referenceNumber: true, siteId: true } },
      },
      orderBy: { recordedAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      transactionId: row.transactionId,
      referenceNumber: row.transaction.referenceNumber,
      sequence: row.sequence,
      kind: row.kind,
      weightKg: row.weightKg.toString(),
      recordedAt: row.recordedAt.toISOString(),
      source: row.source,
    })),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
    timezone: "UTC",
  };
}

export async function listIntegrationVehicles(actor: IntegrationActor, query: Record<string, unknown>) {
  return listVehicles(actor, query);
}

export async function getIntegrationVehicle(actor: IntegrationActor, id: string) {
  return { vehicle: await getVehicle(actor, id) };
}

export async function createIntegrationVehicle(actor: IntegrationActor, body: unknown) {
  const input = parseVehicleCreateInput(body);
  const vehicle = await createVehicle(actor, input);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.INTEGRATION_WRITE,
    entityType: "Vehicle",
    entityId: vehicle.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { applicationId: actor.integration.applicationId, operation: "create_vehicle" },
  });
  return { vehicle };
}

export async function updateIntegrationVehicle(actor: IntegrationActor, id: string, body: unknown) {
  const input = parseVehicleUpdateInput(body);
  const vehicle = await updateVehicle(actor, id, input);
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.INTEGRATION_WRITE,
    entityType: "Vehicle",
    entityId: vehicle.id,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: { applicationId: actor.integration.applicationId, operation: "update_vehicle" },
  });
  return { vehicle };
}

export async function listIntegrationMaterials(actor: IntegrationActor, query: Record<string, unknown>) {
  return listMaterials(actor, query);
}

export async function getIntegrationMaterial(actor: IntegrationActor, id: string) {
  return { material: await getMaterial(actor, id) };
}

export async function listIntegrationWeighbridges(actor: IntegrationActor) {
  return listWeighbridges(actor);
}

export async function listIntegrationDevices(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  if (parsed.siteId) {
    await assertRequestedSite(actor, parsed.siteId);
  }
  const gatewayWhere: Prisma.EdgeGatewayWhereInput = {
    organizationId: actor.user.organizationId,
  };
  if (parsed.siteId) {
    gatewayWhere.siteId = parsed.siteId;
  } else {
    const siteIds = accessibleSiteIds(actor);
    if (siteIds !== null) {
      gatewayWhere.siteId = { in: siteIds };
    }
  }
  const where: Prisma.EdgeDeviceWhereInput = { gateway: gatewayWhere };
  const [total, rows] = await prisma.$transaction([
    prisma.edgeDevice.count({ where }),
    prisma.edgeDevice.findMany({
      where,
      orderBy: { code: "asc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map(toPublicDevice),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}

export async function listIntegrationEvents(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const eventType = typeof query.eventType === "string" ? query.eventType : "";
  const where: Prisma.IntegrationOutboxEventWhereInput = {
    organizationId: actor.user.organizationId,
    isTest: false,
    ...(parsed.siteId ? { siteId: parsed.siteId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(parsed.updatedSince ? { occurredAt: { gte: parsed.updatedSince } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.integrationOutboxEvent.count({ where }),
    prisma.integrationOutboxEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      siteId: row.siteId,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    })),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
    timezone: "UTC",
  };
}

export async function listIntegrationDocuments(actor: IntegrationActor, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const transactionId = typeof query.transactionId === "string" ? query.transactionId : "";
  if (transactionId) {
    const result = await listTransactionDocuments(actor, transactionId);
    return { items: result.documents.map(toSafeDocument), page: 1, pageSize: result.documents.length, total: result.documents.length };
  }
  const where: Prisma.DocumentWhereInput = {
    organizationId: actor.user.organizationId,
    transaction: {
      ...accessibleSiteWhere(actor),
      ...(parsed.siteId ? { siteId: parsed.siteId } : {}),
    },
    ...(parsed.updatedSince ? { updatedAt: { gte: parsed.updatedSince } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.document.count({ where }),
    prisma.document.findMany({
      where,
      include: documentInclude,
      orderBy: { updatedAt: "desc" },
      skip: parsed.pagination.skip,
      take: parsed.pagination.pageSize,
    }),
  ]);
  return {
    items: rows.map((row) => toSafeDocument(toPublicDocument(row))),
    page: parsed.pagination.page,
    pageSize: parsed.pagination.pageSize,
    total,
  };
}

export async function getIntegrationDocument(actor: IntegrationActor, id: string) {
  return { document: toSafeDocument(await getDocument(actor, id)) };
}

export async function getIntegrationDocumentFile(actor: IntegrationActor, id: string) {
  return getDocumentFile(actor, id);
}

export function documentWriteNotAllowed(): never {
  throw new HttpError(403, "Document uploads are not available on the integration API");
}

export async function listIntegrationReports(actor: IntegrationActor, query: Record<string, unknown>) {
  return reportTransactions(actor, query);
}

export async function listIntegrationNotifications(actor: IntegrationActor, query: Record<string, unknown>) {
  return listOperationalAlerts(actor, query);
}

function toSafeDocument(document: PublicDocument) {
  return {
    id: document.id,
    transactionId: document.transactionId,
    documentType: document.documentType,
    documentTypeLabel: document.documentTypeLabel,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    status: document.status,
    ocrStatus: document.ocrStatus,
    simulatedOcr: document.simulatedOcr,
    uploadedBy: document.uploadedBy,
    verifiedBy: document.verifiedBy,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    ocr: document.ocr
      ? {
          provider: document.ocr.provider,
          source: document.ocr.source,
          processedAt: document.ocr.processedAt,
          fields: document.ocr.fields,
        }
      : null,
    vehicleComparison: document.vehicleComparison,
  };
}
