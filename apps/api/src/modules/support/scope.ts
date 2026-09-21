import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteIds, assertRequestedSite, assertRequestedWeighbridge } from "../shared/siteScope.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type LinkedAssets = {
  siteId: string;
  weighbridgeId: string | null;
  gatewayId: string | null;
  deviceId: string | null;
  transactionId: string | null;
  securityEventId: string | null;
  operationalAlertId: string | null;
  weightAnomalyEventId: string | null;
};

export async function resolveLinkedAssets(
  actor: ActorContext,
  input: {
    siteId: string;
    weighbridgeId?: string | null | undefined;
    gatewayId?: string | null | undefined;
    deviceId?: string | null | undefined;
    transactionId?: string | null | undefined;
    securityEventId?: string | null | undefined;
    operationalAlertId?: string | null | undefined;
    weightAnomalyEventId?: string | null | undefined;
    ticketId?: string | null | undefined;
  },
  db: DbClient = prisma,
): Promise<LinkedAssets> {
  await assertRequestedSite(actor, input.siteId);

  let weighbridgeId = input.weighbridgeId ?? null;
  let gatewayId = input.gatewayId ?? null;
  let deviceId = input.deviceId ?? null;

  if (deviceId) {
    const device = await db.edgeDevice.findFirst({
      where: { id: deviceId, organizationId: actor.user.organizationId },
      select: { id: true, siteId: true, gatewayId: true, weighbridgeId: true },
    });
    if (!device) {
      throw new HttpError(404, "Device not found");
    }
    assertSiteAccess(actor.user, device.siteId);
    if (device.siteId !== input.siteId) {
      throw new HttpError(400, "Device does not belong to that site");
    }
    gatewayId = gatewayId ?? device.gatewayId;
    weighbridgeId = weighbridgeId ?? device.weighbridgeId;
  }

  if (gatewayId) {
    const gateway = await db.edgeGateway.findFirst({
      where: { id: gatewayId, organizationId: actor.user.organizationId },
      select: { id: true, siteId: true },
    });
    if (!gateway) {
      throw new HttpError(404, "Gateway not found");
    }
    assertSiteAccess(actor.user, gateway.siteId);
    if (gateway.siteId !== input.siteId) {
      throw new HttpError(400, "Gateway does not belong to that site");
    }
  }

  if (weighbridgeId) {
    await assertRequestedWeighbridge(actor, weighbridgeId, input.siteId);
  }

  const transactionId = await assertOrgSiteRecord(
    db,
    actor,
    input.siteId,
    "transaction",
    input.transactionId,
    "Transaction not found",
  );
  const securityEventId = await assertOrgSiteRecord(
    db,
    actor,
    input.siteId,
    "securityEvent",
    input.securityEventId,
    "Security event not found",
  );
  const operationalAlertId = await assertOrgSiteRecord(
    db,
    actor,
    input.siteId,
    "operationalAlert",
    input.operationalAlertId,
    "Operational alert not found",
  );
  const weightAnomalyEventId = await assertOrgSiteRecord(
    db,
    actor,
    input.siteId,
    "weightAnomalyEvent",
    input.weightAnomalyEventId,
    "Weight anomaly not found",
  );

  if (input.ticketId) {
    const ticket = await db.supportTicket.findFirst({
      where: { id: input.ticketId, organizationId: actor.user.organizationId },
      select: { id: true, siteId: true },
    });
    if (!ticket) {
      throw new HttpError(404, "Support ticket not found");
    }
    assertSiteAccess(actor.user, ticket.siteId);
    if (ticket.siteId !== input.siteId) {
      throw new HttpError(400, "Support ticket does not belong to that site");
    }
  }

  return {
    siteId: input.siteId,
    weighbridgeId,
    gatewayId,
    deviceId,
    transactionId,
    securityEventId,
    operationalAlertId,
    weightAnomalyEventId,
  };
}

export function supportSiteWhere(actor: ActorContext): { siteId?: { in: string[] } } {
  const siteIds = accessibleSiteIds(actor);
  if (siteIds === null) {
    return {};
  }
  return { siteId: { in: siteIds } };
}

export function hasPermission(actor: ActorContext, code: string): boolean {
  return actor.user.permissions.includes(code);
}

async function assertOrgSiteRecord(
  db: DbClient,
  actor: ActorContext,
  siteId: string,
  model: "transaction" | "securityEvent" | "operationalAlert" | "weightAnomalyEvent",
  id: string | null | undefined,
  notFound: string,
): Promise<string | null> {
  if (!id) {
    return null;
  }

  const record =
    model === "transaction"
      ? await db.transaction.findFirst({
          where: { id, organizationId: actor.user.organizationId },
          select: { id: true, siteId: true },
        })
      : model === "securityEvent"
        ? await db.securityEvent.findFirst({
            where: { id, organizationId: actor.user.organizationId },
            select: { id: true, siteId: true },
          })
        : model === "operationalAlert"
          ? await db.operationalAlert.findFirst({
              where: { id, organizationId: actor.user.organizationId },
              select: { id: true, siteId: true },
            })
          : await db.weightAnomalyEvent.findFirst({
              where: { id, organizationId: actor.user.organizationId },
              select: { id: true, siteId: true },
            });

  if (!record) {
    throw new HttpError(404, notFound);
  }
  assertSiteAccess(actor.user, record.siteId);
  if (record.siteId !== siteId) {
    throw new HttpError(400, `${notFound.replace(" not found", "")} does not belong to that site`);
  }
  return record.id;
}
