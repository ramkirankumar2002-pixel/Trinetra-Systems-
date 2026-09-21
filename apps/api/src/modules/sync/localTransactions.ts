import { TransactionStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { createTransaction, identifyTransaction } from "../transactions/service.js";
import { finalizeTransaction } from "../transactions/lifecycle.js";
import type { AuthenticatedGateway } from "../edge/types.js";

export async function resolveCentralTransactionId(
  gatewayId: string,
  localTransactionId: string | null,
  transactionId: string | null,
): Promise<string | null> {
  if (transactionId) {
    return transactionId;
  }
  if (!localTransactionId) {
    return null;
  }
  const mapped = await prisma.edgeLocalTransactionMap.findUnique({
    where: { gatewayId_localTransactionId: { gatewayId, localTransactionId } },
  });
  return mapped?.transactionId ?? null;
}

export async function upsertLocalTransaction(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  payload: Record<string, unknown>,
): Promise<{ transactionId: string; already: boolean }> {
  const localTransactionId = required(payload.localTransactionId, "localTransactionId");
  const existing = await prisma.edgeLocalTransactionMap.findUnique({
    where: { gatewayId_localTransactionId: { gatewayId: gateway.id, localTransactionId } },
  });
  if (existing?.transactionId) {
    return { transactionId: existing.transactionId, already: true };
  }

  const weighbridgeId =
    typeof payload.weighbridgeId === "string"
      ? payload.weighbridgeId
      : (await prisma.weighbridge.findFirst({
          where: { organizationId: gateway.organizationId, siteId: gateway.siteId, isActive: true },
          select: { id: true },
        }))?.id;
  if (!weighbridgeId) {
    throw new HttpError(409, "No weighbridge is available for this gateway site");
  }

  const created = await createTransaction(actor, { weighbridgeId, siteId: gateway.siteId });
  if (typeof payload.vehicleId === "string" && payload.vehicleId !== "") {
    try {
      await identifyTransaction(actor, created.id, { vehicleId: payload.vehicleId });
    } catch {
      // Cached vehicle may no longer exist. Keep the visit at ARRIVED.
    }
  }

  await prisma.edgeLocalTransactionMap.upsert({
    where: { gatewayId_localTransactionId: { gatewayId: gateway.id, localTransactionId } },
    update: {
      transactionId: created.id,
      vehicleNumber: typeof payload.vehicleNumber === "string" ? payload.vehicleNumber : null,
      weighbridgeId,
      localState: typeof payload.localState === "string" ? payload.localState : "IDENTIFIED",
      centralStatus: created.status,
    },
    create: {
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      localTransactionId,
      transactionId: created.id,
      vehicleNumber: typeof payload.vehicleNumber === "string" ? payload.vehicleNumber : null,
      weighbridgeId,
      localState: typeof payload.localState === "string" ? payload.localState : "IDENTIFIED",
      centralStatus: created.status,
    },
  });

  await writeAudit({
    organizationId: gateway.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.LOCAL_TRANSACTION_CREATED,
    entityType: "Transaction",
    entityId: created.id,
    metadata: { localTransactionId, gatewayId: gateway.id },
  });

  return { transactionId: created.id, already: false };
}

export async function applyLocalTransactionState(
  gateway: AuthenticatedGateway,
  actor: ActorContext,
  payload: Record<string, unknown>,
): Promise<{ transactionId: string | null; completionState: string }> {
  const localTransactionId = required(payload.localTransactionId, "localTransactionId");
  const mapped = await prisma.edgeLocalTransactionMap.findUnique({
    where: { gatewayId_localTransactionId: { gatewayId: gateway.id, localTransactionId } },
    include: { transaction: { select: { id: true, status: true } } },
  });
  if (!mapped?.transaction) {
    throw new HttpError(409, "Local transaction has not been synchronized yet");
  }

  const localState = typeof payload.localState === "string" ? payload.localState : mapped.localState;
  await prisma.edgeLocalTransactionMap.update({
    where: { id: mapped.id },
    data: {
      localState,
      centralStatus: mapped.transaction.status,
      completionState: typeof payload.completionState === "string" ? payload.completionState : mapped.completionState,
      ...(typeof payload.grossWeightKg === "string" ? { grossWeightKg: payload.grossWeightKg } : {}),
      ...(typeof payload.tareWeightKg === "string" ? { tareWeightKg: payload.tareWeightKg } : {}),
      ...(typeof payload.netWeightKg === "string" ? { netWeightKg: payload.netWeightKg } : {}),
    },
  });

  if (localState === "LOCAL_COMPLETED" && mapped.transaction.status === TransactionStatus.SECOND_WEIGHMENT) {
    const finalized = await finalizeTransaction(actor, mapped.transaction.id);
    await prisma.edgeLocalTransactionMap.update({
      where: { id: mapped.id },
      data: { completionState: "CENTRAL_COMPLETED", centralStatus: finalized.status },
    });
    return { transactionId: mapped.transaction.id, completionState: "CENTRAL_COMPLETED" };
  }

  return { transactionId: mapped.transaction.id, completionState: mapped.completionState };
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A valid ${field} is required`);
  }
  return value.trim();
}
