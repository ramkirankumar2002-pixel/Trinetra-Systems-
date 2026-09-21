import { ApprovalDecision, DocumentStatus } from "@prisma/client";
import { EVENT_KEYS } from "../../domain/notificationCatalog.js";
import { prisma } from "../../db/client.js";
import type { ActorContext } from "../shared/actor.js";
import { safeEmitOperationalEvent, transactionLabel } from "./emit.js";

export async function emitPendingApprovalRequired(actor: ActorContext, transactionId: string): Promise<void> {
  const approval = await prisma.approval.findFirst({
    where: { transactionId, organizationId: actor.user.organizationId, decision: ApprovalDecision.PENDING },
    include: {
      department: { select: { id: true, code: true, name: true } },
      transaction: {
        select: {
          id: true,
          referenceNumber: true,
          organizationId: true,
          siteId: true,
          vehicle: { select: { displayRegistrationNumber: true } },
          material: { select: { name: true } },
        },
      },
    },
    orderBy: { requestedAt: "desc" },
  });
  if (!approval) {
    return;
  }

  const label = transactionLabel({
    referenceNumber: approval.transaction.referenceNumber,
    vehicleNumber: approval.transaction.vehicle?.displayRegistrationNumber ?? null,
    materialName: approval.transaction.material?.name ?? null,
  });

  await safeEmitOperationalEvent({
    actor,
    type: "APPROVAL_REQUIRED",
    organizationId: approval.organizationId,
    siteId: approval.siteId,
    title: `${approval.department.name} approval required`,
    message: `${approval.department.name} approval is required for ${label}.`,
    eventKey: EVENT_KEYS.approvalRequired(approval.id),
    transactionId: approval.transactionId,
    approvalId: approval.id,
    entityType: "Approval",
    entityId: approval.id,
    departmentId: approval.departmentId,
    departmentCode: approval.department.code,
    assignedUserId: approval.assignedUserId,
  });
}

export async function emitApprovalDecision(
  actor: ActorContext,
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  const approval = await prisma.approval.findFirst({
    where: { id: approvalId, organizationId: actor.user.organizationId },
    include: {
      department: { select: { code: true, name: true } },
      transaction: {
        select: {
          id: true,
          createdByUserId: true,
          referenceNumber: true,
          organizationId: true,
          siteId: true,
          vehicle: { select: { displayRegistrationNumber: true } },
          material: { select: { name: true } },
        },
      },
    },
  });
  if (!approval) {
    return;
  }

  const label = transactionLabel({
    referenceNumber: approval.transaction.referenceNumber,
    vehicleNumber: approval.transaction.vehicle?.displayRegistrationNumber ?? null,
    materialName: approval.transaction.material?.name ?? null,
  });
  const approved = decision === "APPROVED";

  await safeEmitOperationalEvent({
    actor,
    type: approved ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
    organizationId: approval.organizationId,
    siteId: approval.siteId,
    title: approved ? `${approval.department.name} approved ${approval.transaction.referenceNumber}` : `${approval.department.name} rejected ${approval.transaction.referenceNumber}`,
    message: approved
      ? `${approval.department.name} approved ${label}.`
      : `${approval.department.name} rejected ${label}. The workflow is blocked until the issue is handled.`,
    eventKey: approved ? EVENT_KEYS.approvalApproved(approval.id) : EVENT_KEYS.approvalRejected(approval.id),
    transactionId: approval.transactionId,
    approvalId: approval.id,
    entityType: "Approval",
    entityId: approval.id,
    extraRecipientUserIds: [approval.transaction.createdByUserId],
  });

  if (!approved) {
    await safeEmitOperationalEvent({
      actor,
      type: "WORKFLOW_EXCEPTION",
      organizationId: approval.organizationId,
      siteId: approval.siteId,
      title: `Workflow blocked on ${approval.transaction.referenceNumber}`,
      message: `${label} is blocked after a rejected approval.`,
      eventKey: EVENT_KEYS.workflowException(approval.transactionId, `approval:${approval.id}`),
      transactionId: approval.transactionId,
      approvalId: approval.id,
      entityType: "Transaction",
      entityId: approval.transactionId,
    });
  }
}

export async function emitDocumentReviewRequired(actor: ActorContext, documentId: string): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: actor.user.organizationId },
    include: {
      transaction: {
        select: {
          id: true,
          siteId: true,
          referenceNumber: true,
          vehicle: { select: { displayRegistrationNumber: true } },
        },
      },
    },
  });
  if (!document || document.status !== DocumentStatus.EXTRACTED) {
    return;
  }

  await safeEmitOperationalEvent({
    actor,
    type: "DOCUMENT_REVIEW_REQUIRED",
    organizationId: document.organizationId,
    siteId: document.transaction.siteId,
    title: "Document review required",
    message: `${document.documentType} on ${document.transaction.referenceNumber} is ready for verification.`,
    eventKey: EVENT_KEYS.documentReview(document.id),
    transactionId: document.transactionId,
    entityType: "Document",
    entityId: document.id,
  });
}

export async function emitDocumentVerified(actor: ActorContext, documentId: string): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, organizationId: actor.user.organizationId },
    include: {
      transaction: {
        select: {
          id: true,
          siteId: true,
          createdByUserId: true,
          referenceNumber: true,
        },
      },
    },
  });
  if (!document) {
    return;
  }

  if (document.status === DocumentStatus.VERIFIED) {
    await safeEmitOperationalEvent({
      actor,
      type: "DOCUMENT_VERIFIED",
      organizationId: document.organizationId,
      siteId: document.transaction.siteId,
      title: "Document verified",
      message: `${document.documentType} on ${document.transaction.referenceNumber} has been verified.`,
      eventKey: EVENT_KEYS.documentVerified(document.id),
      transactionId: document.transactionId,
      entityType: "Document",
      entityId: document.id,
      extraRecipientUserIds: [document.transaction.createdByUserId],
    });
    return;
  }

  if (document.status === DocumentStatus.REJECTED) {
    await safeEmitOperationalEvent({
      actor,
      type: "WORKFLOW_EXCEPTION",
      organizationId: document.organizationId,
      siteId: document.transaction.siteId,
      title: "Document verification issue",
      message: `${document.documentType} on ${document.transaction.referenceNumber} was rejected.`,
      eventKey: EVENT_KEYS.workflowException(document.transactionId, `document:${document.id}`),
      transactionId: document.transactionId,
      entityType: "Document",
      entityId: document.id,
    });
  }
}

export async function emitUnloadingEvent(
  actor: ActorContext,
  transactionId: string,
  kind: "ASSIGNED" | "STARTED" | "COMPLETED",
): Promise<void> {
  const transaction = await loadTransactionLabel(actor, transactionId);
  if (!transaction) {
    return;
  }

  const unloading = await prisma.unloading.findUnique({
    where: { transactionId },
    include: { unloadingPoint: { select: { id: true, code: true, name: true } } },
  });
  if (!unloading) {
    return;
  }

  const point = unloading.unloadingPoint
    ? `${unloading.unloadingPoint.code} ${unloading.unloadingPoint.name}`
    : "the assigned point";
  const label = transactionLabel(transaction);

  if (kind === "ASSIGNED") {
    await safeEmitOperationalEvent({
      actor,
      type: "UNLOADING_ASSIGNED",
      organizationId: transaction.organizationId,
      siteId: transaction.siteId,
      title: "Unloading assigned",
      message: `${label} is assigned to ${point}.`,
      eventKey: EVENT_KEYS.unloadingAssigned(
        transaction.id,
        unloading.unloadingPoint?.id ?? "none",
        unloading.assignedAt?.toISOString() ?? new Date().toISOString(),
      ),
      transactionId: transaction.id,
      entityType: "Transaction",
      entityId: transaction.id,
    });
    return;
  }

  if (kind === "STARTED") {
    await safeEmitOperationalEvent({
      actor,
      type: "UNLOADING_STARTED",
      organizationId: transaction.organizationId,
      siteId: transaction.siteId,
      title: "Unloading started",
      message: `Unloading has started for ${label} at ${point}.`,
      eventKey: EVENT_KEYS.unloadingStarted(transaction.id),
      transactionId: transaction.id,
      entityType: "Transaction",
      entityId: transaction.id,
    });
    return;
  }

  await safeEmitOperationalEvent({
    actor,
    type: "UNLOADING_COMPLETED",
    organizationId: transaction.organizationId,
    siteId: transaction.siteId,
    title: "Unloading completed",
    message: `Unloading is complete for ${label}. Second weighment is next.`,
    eventKey: EVENT_KEYS.unloadingCompleted(transaction.id),
    transactionId: transaction.id,
    entityType: "Transaction",
    entityId: transaction.id,
  });
  await safeEmitOperationalEvent({
    actor,
    type: "SECOND_WEIGHMENT_REQUIRED",
    organizationId: transaction.organizationId,
    siteId: transaction.siteId,
    title: "Second weighment required",
    message: `${label} is unloaded and waiting for the second weighment.`,
    eventKey: EVENT_KEYS.secondWeighment(transaction.id),
    transactionId: transaction.id,
    entityType: "Transaction",
    entityId: transaction.id,
  });
}

export async function emitWeightOrTransactionException(
  actor: ActorContext,
  transactionId: string,
  kind: "WEIGHT" | "TRANSACTION",
): Promise<void> {
  const transaction = await loadTransactionLabel(actor, transactionId);
  if (!transaction) {
    return;
  }
  const label = transactionLabel(transaction);
  const weight = kind === "WEIGHT";

  await safeEmitOperationalEvent({
    actor,
    type: weight ? "WEIGHT_EXCEPTION" : "TRANSACTION_EXCEPTION",
    organizationId: transaction.organizationId,
    siteId: transaction.siteId,
    title: weight ? `Weight exception on ${transaction.referenceNumber}` : `Transaction exception on ${transaction.referenceNumber}`,
    message: weight
      ? `Weight validation failed for ${label}. This is an operational exception, not a fraud finding.`
      : `${label} entered a blocking exception state.`,
    eventKey: weight ? EVENT_KEYS.weightException(transaction.id) : EVENT_KEYS.transactionException(transaction.id),
    transactionId: transaction.id,
    entityType: "Transaction",
    entityId: transaction.id,
  });
}

export async function emitTransactionCompleted(actor: ActorContext, transactionId: string): Promise<void> {
  const transaction = await loadTransactionLabel(actor, transactionId);
  if (!transaction) {
    return;
  }

  await safeEmitOperationalEvent({
    actor,
    type: "TRANSACTION_COMPLETED",
    organizationId: transaction.organizationId,
    siteId: transaction.siteId,
    title: `Transaction ${transaction.referenceNumber} completed`,
    message: `${transactionLabel(transaction)} has been completed.`,
    eventKey: EVENT_KEYS.transactionCompleted(transaction.id),
    transactionId: transaction.id,
    entityType: "Transaction",
    entityId: transaction.id,
    extraRecipientUserIds: [transaction.createdByUserId],
  });
}

async function loadTransactionLabel(actor: ActorContext, transactionId: string) {
  return prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    select: {
      id: true,
      organizationId: true,
      siteId: true,
      referenceNumber: true,
      createdByUserId: true,
      vehicle: { select: { displayRegistrationNumber: true } },
      material: { select: { name: true } },
    },
  }).then((row) =>
    row
      ? {
          ...row,
          vehicleNumber: row.vehicle?.displayRegistrationNumber ?? null,
          materialName: row.material?.name ?? null,
        }
      : null,
  );
}
