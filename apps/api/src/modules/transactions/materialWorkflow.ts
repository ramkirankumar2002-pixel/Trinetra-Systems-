import { Prisma, TransactionStatus, WeighmentKind } from "@prisma/client";
import { env } from "../../config/env.js";
import { fieldValue, parseExtractedDocumentData } from "../../domain/extractedDocument.js";
import { matchMaterialFromOcr } from "../../domain/materialMatch.js";
import { assertTransactionMutable } from "../../domain/transactionMutability.js";
import { assertCanAssignMaterial } from "../../domain/workflowEngine.js";
import {
  buildWorkflowSnapshot,
  parseWorkflowConfig,
  parseWorkflowSnapshot,
  type MaterialIdentificationStatus,
  type MaterialSource,
  type WorkflowSnapshot,
} from "../../domain/workflowSnapshot.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { resolveMaterialWorkflow } from "../materials/service.js";
import type { ActorContext } from "../shared/actor.js";
import {
  toPublicTransaction,
  transactionInclude,
  transactionProgress,
  type MaterialSuggestion,
  type PublicTransaction,
  type TransactionRecord,
} from "./mapper.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function suggestTransactionMaterial(
  actor: ActorContext,
  transactionId: string,
): Promise<MaterialSuggestion> {
  const transaction = await loadOwnedTransaction(prisma, actor, transactionId);
  return suggestFromDocuments(actor.user.organizationId, transaction);
}

export async function assignTransactionMaterial(
  actor: ActorContext,
  transactionId: string,
  input: { materialId?: string | undefined; source: MaterialSource; documentId?: string | undefined },
): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadOwnedTransaction(tx, actor, transactionId);
    const locked = assertTransactionMutable(transaction.status);
    if (locked) {
      throw new HttpError(409, locked);
    }
    const suggestion = await suggestFromDocuments(actor.user.organizationId, transaction, input.documentId, tx);
    const source = input.source;
    let materialId = input.materialId;
    let identificationStatus: MaterialIdentificationStatus = "MATCHED";
    let ocrMaterialName = suggestion.ocrMaterialName;
    let ocrConfidence = suggestion.ocrConfidence;

    if (source === "OCR") {
      ocrMaterialName = suggestion.ocrMaterialName;
      ocrConfidence = suggestion.ocrConfidence;
      if (suggestion.status !== "MATCHED" || !suggestion.material) {
        throw new HttpError(409, suggestion.reason);
      }
      materialId = suggestion.material.id;
      identificationStatus = "MATCHED";
    } else if (!materialId) {
      throw new HttpError(400, "A material is required");
    } else {
      identificationStatus = "MATCHED";
    }

    const material = await tx.material.findFirst({
      where: {
        id: materialId,
        organizationId: actor.user.organizationId,
        deletedAt: null,
        isActive: true,
      },
    });
    if (!material) {
      throw new HttpError(400, "Material was not found or is inactive");
    }

    const assignment = await resolveMaterialWorkflow(
      actor.user.organizationId,
      material.id,
      transaction.siteId,
      new Date(),
    );
    if (!assignment || !assignment.workflowDefinition.isActive) {
      throw new HttpError(409, "This material has no active workflow configuration");
    }

    const snapshot = buildWorkflowSnapshot({
      assignmentId: assignment.id,
      material: {
        id: material.id,
        code: material.code,
        name: material.name,
        unitOfMeasure: material.unitOfMeasure,
      },
      workflow: {
        id: assignment.workflowDefinition.id,
        code: assignment.workflowDefinition.code,
        name: assignment.workflowDefinition.name,
      },
      config: parseWorkflowConfig(assignment.workflowDefinition.config),
      steps: assignment.workflowDefinition.steps.map((step) => ({
        sortOrder: step.sortOrder,
        capability: step.capability,
        name: step.name,
        isRequired: step.isRequired,
        approvalDepartment: step.approvalDepartment,
      })),
      source,
      ocrMaterialName,
      ocrConfidence,
      identificationStatus,
    });

    const blocked = assertCanAssignMaterial(transactionProgress(transaction), snapshot);
    if (blocked) {
      throw new HttpError(409, blocked);
    }

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        materialId: material.id,
        workflowDefinitionId: assignment.workflowDefinition.id,
        materialSource: source,
        materialVerifiedAt: null,
        materialVerifiedByUserId: null,
        workflowSnapshot: snapshot,
        status: TransactionStatus.MATERIAL_CLASSIFIED,
      },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.MATERIAL_ASSIGNED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          materialCode: material.code,
          workflowCode: assignment.workflowDefinition.code,
          source,
          identificationStatus,
        },
      },
      tx,
    );

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.WORKFLOW_STARTED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          workflowCode: assignment.workflowDefinition.code,
          assignmentId: assignment.id,
        },
      },
      tx,
    );

    return next;
  });

  return toPublicTransaction(updated);
}

export async function verifyTransactionMaterial(
  actor: ActorContext,
  transactionId: string,
  input: { materialId?: string | undefined },
): Promise<PublicTransaction> {
  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await loadOwnedTransaction(tx, actor, transactionId);
    const locked = assertTransactionMutable(transaction.status);
    if (locked) {
      throw new HttpError(409, locked);
    }
    const current = parseWorkflowSnapshotOrThrow(transaction.workflowSnapshot);
    if (transaction.status !== TransactionStatus.MATERIAL_CLASSIFIED) {
      throw new HttpError(409, "Material can only be verified after it is assigned");
    }
    if (transaction.weighments.some((weighment) => weighment.kind === WeighmentKind.GROSS)) {
      throw new HttpError(409, "Material cannot be changed after the first weighment");
    }

    let snapshot = {
      ...current,
      verified: true,
      verifiedAt: new Date().toISOString(),
      verifiedByUserId: actor.user.id,
      identificationStatus: "MATCHED" as const,
    };

    if (input.materialId && input.materialId !== current.material.id) {
      const reassigned = await assignWithinTransaction(tx, actor, transaction, {
        materialId: input.materialId,
        source: "MANUAL",
        identificationStatus: "MATCHED",
        ocrMaterialName: current.ocrMaterialName,
        ocrConfidence: current.ocrConfidence,
      });
      snapshot = {
        ...parseWorkflowSnapshotOrThrow(reassigned.workflowSnapshot),
        verified: true,
        verifiedAt: new Date().toISOString(),
        verifiedByUserId: actor.user.id,
        identificationStatus: "MATCHED",
      };
    }

    const next = await tx.transaction.update({
      where: { id: transaction.id },
      data: {
        workflowSnapshot: snapshot,
        materialVerifiedAt: new Date(),
        materialVerifiedByUserId: actor.user.id,
      },
      include: transactionInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.MATERIAL_VERIFIED,
        entityType: "Transaction",
        entityId: next.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          referenceNumber: next.referenceNumber,
          materialCode: snapshot.material.code,
          workflowCode: snapshot.workflow.code,
        },
      },
      tx,
    );

    return next;
  });

  return toPublicTransaction(updated);
}

async function assignWithinTransaction(
  tx: Prisma.TransactionClient,
  actor: ActorContext,
  transaction: TransactionRecord,
  input: {
    materialId: string;
    source: MaterialSource;
    identificationStatus: MaterialIdentificationStatus;
    ocrMaterialName: string | null;
    ocrConfidence: number | null;
  },
) {
  const material = await tx.material.findFirst({
    where: {
      id: input.materialId,
      organizationId: actor.user.organizationId,
      deletedAt: null,
      isActive: true,
    },
  });
  if (!material) {
    throw new HttpError(400, "Material was not found or is inactive");
  }

  const assignment = await resolveMaterialWorkflow(
    actor.user.organizationId,
    material.id,
    transaction.siteId,
    new Date(),
  );
  if (!assignment || !assignment.workflowDefinition.isActive) {
    throw new HttpError(409, "This material has no active workflow configuration");
  }

  const snapshot = buildWorkflowSnapshot({
    assignmentId: assignment.id,
    material: {
      id: material.id,
      code: material.code,
      name: material.name,
      unitOfMeasure: material.unitOfMeasure,
    },
    workflow: {
      id: assignment.workflowDefinition.id,
      code: assignment.workflowDefinition.code,
      name: assignment.workflowDefinition.name,
    },
    config: parseWorkflowConfig(assignment.workflowDefinition.config),
    steps: assignment.workflowDefinition.steps.map((step) => ({
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: step.isRequired,
      approvalDepartment: step.approvalDepartment,
    })),
    source: input.source,
    ocrMaterialName: input.ocrMaterialName,
    ocrConfidence: input.ocrConfidence,
    identificationStatus: input.identificationStatus,
  });

  return tx.transaction.update({
    where: { id: transaction.id },
    data: {
      materialId: material.id,
      workflowDefinitionId: assignment.workflowDefinition.id,
      materialSource: input.source,
      workflowSnapshot: snapshot,
    },
    include: transactionInclude,
  });
}

async function suggestFromDocuments(
  organizationId: string,
  transaction: TransactionRecord,
  documentId?: string | undefined,
  db: DbClient = prisma,
): Promise<MaterialSuggestion> {
  const documents = await db.document.findMany({
    where: {
      transactionId: transaction.id,
      organizationId,
      ...(documentId === undefined ? {} : { id: documentId }),
    },
    orderBy: { createdAt: "desc" },
  });

  const withOcr = documents
    .map((document) => parseExtractedDocumentData(document.extractedData))
    .find((data) => data?.ocr !== null);

  const ocrMaterialName = withOcr ? fieldValue(withOcr, "materialName") : null;
  const ocrConfidence =
    withOcr?.ocr?.fields.find((field) => field.name === "materialName")?.confidence ?? null;

  const materials = await db.material.findMany({
    where: { organizationId, deletedAt: null, isActive: true },
    select: { id: true, code: true, name: true },
  });

  const match = matchMaterialFromOcr(materials, ocrMaterialName, ocrConfidence, env.materialOcrMinConfidence);
  return {
    status: match.status,
    reason: match.reason,
    ocrMaterialName,
    ocrConfidence,
    material: match.material,
  };
}

function parseWorkflowSnapshotOrThrow(value: unknown): WorkflowSnapshot {
  const snapshot = parseWorkflowSnapshot(value);
  if (!snapshot) {
    throw new HttpError(409, "This transaction has no applied workflow");
  }
  return snapshot;
}

async function loadOwnedTransaction(db: DbClient, actor: ActorContext, id: string): Promise<TransactionRecord> {
  const transaction = await db.transaction.findFirst({
    where: { id, organizationId: actor.user.organizationId },
    include: transactionInclude,
  });
  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }
  assertSiteAccess(actor.user, transaction.siteId);
  return transaction;
}
