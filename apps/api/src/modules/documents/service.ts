import { randomUUID } from "node:crypto";
import { DocumentStatus, OcrStatus, Prisma, TransactionStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { validateDocumentFile } from "../../domain/documentFile.js";
import { documentTypeLabel } from "../../domain/documentTypes.js";
import {
  applyFieldCorrections,
  applyOcrResult,
  createUploadedExtractedData,
  OCR_FIELD_NAMES,
  parseExtractedDocumentData,
  type OcrFieldName,
  type StoredOcrResult,
} from "../../domain/extractedDocument.js";
import { canTransition } from "../../domain/transactionState.js";
import { prisma } from "../../db/client.js";
import { getOcrProvider } from "../../integrations/ocr/index.js";
import { getDocumentStorage } from "../../integrations/storage/index.js";
import { HttpError } from "../../lib/httpError.js";
import { recordOcrAttempt } from "../../lib/metrics.js";
import { assertSiteAccess } from "../../middleware/authorize.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { emitDocumentReviewRequired, emitDocumentVerified } from "../notifications/hooks.js";
import type { ActorContext } from "../shared/actor.js";
import { documentInclude, toPublicDocument, type PublicDocument } from "./mapper.js";
import type { ProcessDocumentInput, ReviewDocumentInput, VerifyDocumentInput } from "./validators.js";
import { parseDocumentTypeInput } from "./validators.js";
import type { UploadedMultipartFile } from "./multipart.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

export function listConfiguredDocumentTypes(): Array<{ code: string; label: string }> {
  return env.documentTypes.map((code) => ({
    code,
    label: documentTypeLabel(code),
  }));
}

export function assertCanUploadForTransaction(status: TransactionStatus): void {
  if (status !== TransactionStatus.IDENTIFIED && status !== TransactionStatus.DOCUMENT_PENDING) {
    throw new HttpError(409, "Documents can only be uploaded after the vehicle is identified");
  }
}

export function assertCanVerifyForTransaction(status: TransactionStatus): void {
  if (status !== TransactionStatus.DOCUMENT_PENDING) {
    throw new HttpError(409, "This transaction is not awaiting document verification");
  }
}

export async function listTransactionDocuments(
  actor: ActorContext,
  transactionId: string,
): Promise<{ documents: PublicDocument[] }> {
  const transaction = await loadTransaction(prisma, actor, transactionId);
  const rows = await prisma.document.findMany({
    where: {
      transactionId: transaction.id,
      organizationId: actor.user.organizationId,
    },
    include: documentInclude,
    orderBy: { createdAt: "desc" },
  });

  return { documents: rows.map(toPublicDocument) };
}

export async function getDocument(actor: ActorContext, documentId: string): Promise<PublicDocument> {
  const document = await loadDocument(prisma, actor, documentId);
  return toPublicDocument(document);
}

export async function getDocumentFile(
  actor: ActorContext,
  documentId: string,
): Promise<{ bytes: Buffer; mimeType: string; originalFileName: string }> {
  const document = await loadDocument(prisma, actor, documentId);
  const bytes = await getDocumentStorage().read(document.storageKey);
  return {
    bytes,
    mimeType: document.mimeType,
    originalFileName: document.originalFileName,
  };
}

export async function uploadDocument(
  actor: ActorContext,
  transactionId: string,
  input: { documentType: unknown; file: UploadedMultipartFile },
): Promise<PublicDocument> {
  const documentType = parseDocumentTypeInput(input.documentType, env.documentTypes);
  const validated = validateDocumentFile(
    {
      originalFileName: input.file.originalFileName,
      declaredMimeType: input.file.mimeType,
      buffer: input.file.buffer,
    },
    { maxBytes: env.documentMaxBytes },
  );
  if (typeof validated === "string") {
    throw new HttpError(400, validated);
  }

  const documentId = randomUUID();
  const storage = getDocumentStorage();
  let storedKey: string | null = null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const transaction = await loadTransaction(tx, actor, transactionId);
      assertCanUploadForTransaction(transaction.status);

      const stored = await storage.store({
        organizationId: actor.user.organizationId,
        transactionId: transaction.id,
        documentId,
        fileName: validated.safeFileName,
        mimeType: validated.mimeType,
        bytes: input.file.buffer,
      });
      storedKey = stored.key;

      const extracted = createUploadedExtractedData({
        sizeBytes: validated.sizeBytes,
        storageProvider: storage.provider,
      });

      const document = await tx.document.create({
        data: {
          id: documentId,
          organizationId: actor.user.organizationId,
          transactionId: transaction.id,
          uploadedByUserId: actor.user.id,
          documentType,
          storageKey: stored.key,
          originalFileName: validated.originalFileName,
          mimeType: validated.mimeType,
          status: DocumentStatus.UPLOADED,
          ocrStatus: OcrStatus.NOT_STARTED,
          extractedData: extracted as Prisma.InputJsonValue,
        },
        include: documentInclude,
      });

      if (transaction.status === TransactionStatus.IDENTIFIED) {
        if (!canTransition(transaction.status, TransactionStatus.DOCUMENT_PENDING)) {
          throw new HttpError(409, "Documents can only be uploaded after the vehicle is identified");
        }
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { status: TransactionStatus.DOCUMENT_PENDING },
        });
      }

      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
          entityType: "Document",
          entityId: document.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            transactionId: transaction.id,
            referenceNumber: transaction.referenceNumber,
            documentType,
            originalFileName: validated.originalFileName,
            mimeType: validated.mimeType,
            fileSize: validated.sizeBytes,
          },
        },
        tx,
      );

      return document;
    });

    return toPublicDocument(created);
  } catch (error) {
    if (storedKey) {
      await storage.remove(storedKey);
    }
    throw error;
  }
}

export async function processDocument(
  actor: ActorContext,
  documentId: string,
  input: ProcessDocumentInput,
): Promise<PublicDocument> {
  const started = await prisma.$transaction(async (tx) => {
    const document = await loadDocument(tx, actor, documentId);
    if (document.status !== DocumentStatus.UPLOADED && document.ocrStatus !== OcrStatus.FAILED) {
      throw new HttpError(409, "This document is not ready for OCR processing");
    }

    const processing = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.PROCESSING,
        ocrStatus: OcrStatus.NOT_STARTED,
      },
      include: documentInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.OCR_STARTED,
        entityType: "Document",
        entityId: document.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: document.transactionId,
          provider: "simulated-ocr",
          simulated: true,
        },
      },
      tx,
    );

    return processing;
  });

  try {
    const transaction = await prisma.transaction.findFirst({
      where: { id: started.transactionId, organizationId: actor.user.organizationId },
      include: { vehicle: { select: { registrationNumber: true } } },
    });

    const extracted = await getOcrProvider().extract({
      documentId: started.id,
      documentType: started.documentType,
      originalFileName: started.originalFileName,
      mimeType: started.mimeType,
      registeredVehicleNumber: transaction?.vehicle?.registrationNumber ?? null,
      ...(input.anprVehicleNumber === undefined ? {} : { anprVehicleNumber: input.anprVehicleNumber }),
      forceVehicleMismatch: input.forceVehicleMismatch,
    });

    const current = parseExtractedDocumentData(started.extractedData) ?? createUploadedExtractedData({
      sizeBytes: 0,
      storageProvider: getDocumentStorage().provider,
    });

    const storedOcr: StoredOcrResult = {
      provider: extracted.provider,
      source: "SIMULATED",
      processedAt: extracted.extractedAt,
      rawText: extracted.rawText,
      fields: extracted.fields
        .filter((field): field is typeof field & { name: OcrFieldName } =>
          (OCR_FIELD_NAMES as readonly string[]).includes(field.name),
        )
        .map((field) => ({
          name: field.name,
          value: field.value,
          confidence: field.confidence,
          originalValue: field.value,
          corrected: false,
        })),
    };

    const nextData = applyOcrResult(current, storedOcr, {
      anprVehicleNumber: input.anprVehicleNumber ?? null,
      registeredVehicleNumber: transaction?.vehicle?.registrationNumber ?? null,
    });

    const completed = await prisma.$transaction(async (tx) => {
      const updated = await tx.document.update({
        where: { id: started.id },
        data: {
          status: DocumentStatus.EXTRACTED,
          ocrStatus: OcrStatus.SIMULATED,
          extractedData: nextData as Prisma.InputJsonValue,
        },
        include: documentInclude,
      });

      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.OCR_COMPLETED,
          entityType: "Document",
          entityId: updated.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            transactionId: updated.transactionId,
            provider: extracted.provider,
            simulated: true,
            comparison: nextData.vehicleComparison?.result ?? null,
          },
        },
        tx,
      );

      return updated;
    });

    await emitDocumentReviewRequired(actor, completed.id);
    recordOcrAttempt(false);
    return toPublicDocument(completed);
  } catch (error) {
    recordOcrAttempt(true);
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: started.id },
        data: {
          status: DocumentStatus.UPLOADED,
          ocrStatus: OcrStatus.FAILED,
        },
      });

      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.OCR_FAILED,
          entityType: "Document",
          entityId: started.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            transactionId: started.transactionId,
            provider: "simulated-ocr",
            simulated: true,
            reason: error instanceof Error ? error.message : "OCR processing failed",
          },
        },
        tx,
      );
    });

    throw new HttpError(500, "Simulated OCR processing failed");
  }
}

export async function reviewDocument(
  actor: ActorContext,
  documentId: string,
  input: ReviewDocumentInput,
): Promise<PublicDocument> {
  const updated = await prisma.$transaction(async (tx) => {
    const document = await loadDocument(tx, actor, documentId);
    if (document.status !== DocumentStatus.EXTRACTED) {
      throw new HttpError(409, "Only extracted documents can be reviewed");
    }

    const current = parseExtractedDocumentData(document.extractedData);
    if (!current?.ocr) {
      throw new HttpError(409, "OCR results are not available to review");
    }

    const transaction = await tx.transaction.findFirst({
      where: { id: document.transactionId },
      include: { vehicle: { select: { registrationNumber: true } } },
    });

    const nextData = applyFieldCorrections(current, input.fields, {
      anprVehicleNumber: input.anprVehicleNumber ?? current.vehicleComparison?.anprVehicleNumber ?? null,
      registeredVehicleNumber: transaction?.vehicle?.registrationNumber ?? null,
    });

    const reviewed = await tx.document.update({
      where: { id: document.id },
      data: {
        extractedData: nextData as Prisma.InputJsonValue,
      },
      include: documentInclude,
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.DOCUMENT_REVIEWED,
        entityType: "Document",
        entityId: document.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: document.transactionId,
          correctedFields: Object.keys(input.fields),
          comparison: nextData.vehicleComparison?.result ?? null,
        },
      },
      tx,
    );

    return reviewed;
  });

  return toPublicDocument(updated);
}

export async function verifyDocument(
  actor: ActorContext,
  documentId: string,
  input: VerifyDocumentInput,
): Promise<PublicDocument> {
  const updated = await prisma.$transaction(async (tx) => {
    const document = await loadDocument(tx, actor, documentId);
    const transaction = await loadTransaction(tx, actor, document.transactionId);

    if (document.status !== DocumentStatus.EXTRACTED) {
      throw new HttpError(409, "Only extracted documents can be verified or rejected");
    }

    if (input.decision === "REJECTED") {
      const rejected = await tx.document.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.REJECTED,
          verifiedByUserId: actor.user.id,
        },
        include: documentInclude,
      });

      await writeAudit(
        {
          organizationId: actor.user.organizationId,
          actorUserId: actor.user.id,
          action: AUDIT_ACTIONS.DOCUMENT_REJECTED,
          entityType: "Document",
          entityId: document.id,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
          metadata: {
            transactionId: transaction.id,
            referenceNumber: transaction.referenceNumber,
            ...(input.note === undefined ? {} : { note: input.note }),
          },
        },
        tx,
      );

      return rejected;
    }

    assertCanVerifyForTransaction(transaction.status);
    if (!canTransition(transaction.status, TransactionStatus.DOCUMENT_VERIFIED)) {
      throw new HttpError(409, "This transaction is not awaiting document verification");
    }

    const verified = await tx.document.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.VERIFIED,
        verifiedByUserId: actor.user.id,
      },
      include: documentInclude,
    });

    await tx.transaction.update({
      where: { id: transaction.id },
      data: { status: TransactionStatus.DOCUMENT_VERIFIED },
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.DOCUMENT_VERIFIED,
        entityType: "Document",
        entityId: document.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: {
          transactionId: transaction.id,
          referenceNumber: transaction.referenceNumber,
          comparison: parseExtractedDocumentData(document.extractedData)?.vehicleComparison?.result ?? null,
        },
      },
      tx,
    );

    return verified;
  });

  await emitDocumentVerified(actor, updated.id);
  return toPublicDocument(updated);
}

async function loadTransaction(
  db: DbClient,
  actor: ActorContext,
  transactionId: string,
): Promise<{ id: string; status: TransactionStatus; siteId: string; referenceNumber: string }> {
  const transaction = await db.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    select: { id: true, status: true, siteId: true, referenceNumber: true },
  });

  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }

  assertSiteAccess(actor.user, transaction.siteId);
  return transaction;
}

async function loadDocument(db: DbClient, actor: ActorContext, documentId: string) {
  const document = await db.document.findFirst({
    where: { id: documentId, organizationId: actor.user.organizationId },
    include: {
      ...documentInclude,
      transaction: { select: { siteId: true, status: true, referenceNumber: true } },
    },
  });

  if (!document) {
    throw new HttpError(404, "Document not found");
  }

  assertSiteAccess(actor.user, document.transaction.siteId);
  return document;
}
