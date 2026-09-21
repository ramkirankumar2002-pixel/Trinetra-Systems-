import { Prisma } from "@prisma/client";
import { canAcknowledgeAlert, canResolveAlert } from "../../domain/alertLifecycle.js";
import { canManageOperationalAlert } from "../../domain/notificationRouting.js";
import { SEVERITY_RANK, type NotificationSeverity } from "../../domain/notificationCatalog.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, assertRequestedSite } from "../shared/siteScope.js";
import { alertInclude, toPublicOperationalAlert, type PublicOperationalAlert } from "./mapper.js";
import { parseAlertFilters, parseNotificationPagination } from "./validators.js";

export type AlertListResult = {
  items: PublicOperationalAlert[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function listOperationalAlerts(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<AlertListResult> {
  const pagination = parseNotificationPagination(query);
  const filters = parseAlertFilters(query);
  if (filters.siteId) {
    await assertRequestedSite(actor, filters.siteId);
  }

  const where = alertWhere(actor, filters);
  const [total, rows] = await Promise.all([
    prisma.operationalAlert.count({ where }),
    prisma.operationalAlert.findMany({
      where,
      include: alertInclude,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.pageSize,
    }),
  ]);

  const items = rows
    .map(toPublicOperationalAlert)
    .sort((left, right) => {
      const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
      if (severityDelta !== 0) {
        return severityDelta;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pagination.pageSize),
  };
}

export async function listDashboardAlerts(
  actor: ActorContext,
  query: Record<string, unknown>,
): Promise<PublicOperationalAlert[]> {
  const siteId = query.siteId;
  const filters = parseAlertFilters({
    siteId,
    from: query.from,
    to: query.to,
  });
  const result = await prisma.operationalAlert.findMany({
    where: alertWhere(actor, filters),
    include: alertInclude,
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return result
    .map(toPublicOperationalAlert)
    .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity]);
}

export async function getOperationalAlert(actor: ActorContext, id: string): Promise<PublicOperationalAlert> {
  return toPublicOperationalAlert(await loadAccessibleAlert(actor, id));
}

export async function acknowledgeOperationalAlert(
  actor: ActorContext,
  id: string,
): Promise<PublicOperationalAlert> {
  assertCanManage(actor);
  const existing = await loadAccessibleAlert(actor, id);
  const allowed = canAcknowledgeAlert(existing.status);
  if (!allowed.ok) {
    throw new HttpError(409, allowed.error);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.operationalAlert.updateMany({
      where: { id: existing.id, status: "OPEN" },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedByUserId: actor.user.id,
        acknowledgedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "This alert was updated by another user");
    }
    const next = await tx.operationalAlert.findFirst({
      where: { id: existing.id },
      include: alertInclude,
    });
    if (!next) {
      throw new HttpError(404, "Alert not found");
    }
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.ALERT_ACKNOWLEDGED,
        entityType: "OperationalAlert",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { type: next.type, transactionId: next.transactionId },
      },
      tx,
    );
    return next;
  });

  return toPublicOperationalAlert(updated);
}

export async function resolveOperationalAlert(actor: ActorContext, id: string): Promise<PublicOperationalAlert> {
  assertCanManage(actor);
  const existing = await loadAccessibleAlert(actor, id);
  const allowed = canResolveAlert(existing.status);
  if (!allowed.ok) {
    throw new HttpError(409, allowed.error);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const claimed = await tx.operationalAlert.updateMany({
      where: { id: existing.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      data: {
        status: "RESOLVED",
        resolvedByUserId: actor.user.id,
        resolvedAt: new Date(),
        ...(existing.status === "OPEN"
          ? { acknowledgedByUserId: existing.acknowledgedByUserId ?? actor.user.id, acknowledgedAt: existing.acknowledgedAt ?? new Date() }
          : {}),
      },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "This alert was updated by another user");
    }
    const next = await tx.operationalAlert.findFirst({
      where: { id: existing.id },
      include: alertInclude,
    });
    if (!next) {
      throw new HttpError(404, "Alert not found");
    }
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.ALERT_RESOLVED,
        entityType: "OperationalAlert",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { type: next.type, transactionId: next.transactionId },
      },
      tx,
    );
    return next;
  });

  return toPublicOperationalAlert(updated);
}

function assertCanManage(actor: ActorContext): void {
  if (!canManageOperationalAlert(actor.user)) {
    throw new HttpError(403, "You are not authorized to update this alert");
  }
}

async function loadAccessibleAlert(actor: ActorContext, id: string) {
  const existing = await prisma.operationalAlert.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: alertInclude,
  });
  if (!existing) {
    throw new HttpError(404, "Alert not found");
  }
  assertSiteAccess(actor.user, existing.siteId);
  return existing;
}

function alertWhere(
  actor: ActorContext,
  filters: ReturnType<typeof parseAlertFilters>,
): Prisma.OperationalAlertWhereInput {
  const siteIds = accessibleSiteIds(actor);
  return {
    organizationId: actor.user.organizationId,
    ...(siteIds === null ? {} : { siteId: { in: siteIds } }),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : { status: { in: ["OPEN", "ACKNOWLEDGED"] } }),
    ...(filters.severity ? { severity: filters.severity } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
}

export function compareSeverity(left: NotificationSeverity, right: NotificationSeverity): number {
  return SEVERITY_RANK[right] - SEVERITY_RANK[left];
}
