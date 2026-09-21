import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { DocumentStatus, TransactionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import {
  detectDocumentMime,
  isExecutableFileName,
  sanitizeOriginalFileName,
  validateDocumentFile,
} from "../src/domain/documentFile.js";
import { isAllowedDocumentType, normalizeDocumentType } from "../src/domain/documentTypes.js";
import {
  applyFieldCorrections,
  applyOcrResult,
  createUploadedExtractedData,
  type StoredOcrResult,
} from "../src/domain/extractedDocument.js";
import { allowedActions, canTransition } from "../src/domain/transactionState.js";
import { compareVehicleNumbers } from "../src/domain/vehicleComparison.js";
import { SimulatedOCRProvider } from "../src/integrations/ocr/simulatedOcrProvider.js";
import { LocalDevelopmentStorage } from "../src/integrations/storage/localDevelopmentStorage.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { documentAllowedActions } from "../src/modules/documents/mapper.js";
import { assertCanUploadForTransaction, assertCanVerifyForTransaction } from "../src/modules/documents/service.js";
import {
  parseDocumentTypeInput,
  parseProcessDocumentInput,
  parseReviewDocumentInput,
  parseVerifyDocumentInput,
} from "../src/modules/documents/validators.js";

const CATALOG = ["INVOICE", "DELIVERY_CHALLAN", "PURCHASE_DOCUMENT", "GATE_PASS", "OTHER"];

function pdfBuffer(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "ascii");
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
}

function exeDisguisedAsPdf(): Buffer {
  return Buffer.from("MZ executable disguised as a document", "ascii");
}

function officeUser(): AuthenticatedUser {
  return {
    id: "user_office",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: null,
    defaultSite: null,
    roles: [],
    permissions: ["transaction.read"],
    organizationId: "org",
    sessionId: "session",
  };
}

function sampleOcr(vehicleNumber: string): StoredOcrResult {
  return {
    provider: "simulated-ocr",
    source: "SIMULATED",
    processedAt: "2026-09-20T12:00:00.000Z",
    rawText: `SIMULATED OCR OUTPUT\nvehicleNumber=${vehicleNumber}`,
    fields: [
      { name: "invoiceNumber", value: "INV1025", confidence: 0.94, originalValue: "INV1025", corrected: false },
      { name: "vehicleNumber", value: vehicleNumber, confidence: 0.96, originalValue: vehicleNumber, corrected: false },
      { name: "supplierName", value: "ABC Materials", confidence: 0.91, originalValue: "ABC Materials", corrected: false },
      { name: "materialName", value: "Cement", confidence: 0.89, originalValue: "Cement", corrected: false },
      { name: "quantity", value: "30 MT", confidence: 0.87, originalValue: "30 MT", corrected: false },
      { name: "documentDate", value: "2026-09-20", confidence: 0.83, originalValue: "2026-09-20", corrected: false },
    ],
  };
}

describe("authorized and unauthorized document upload", () => {
  it("allows document.upload and rejects users without it", () => {
    const allowed = requirePermission("document.upload");
    const denied = requirePermission("document.upload");
    let allowedError: unknown;
    let deniedError: unknown;

    allowed(
      { auth: { ...officeUser(), permissions: ["document.upload"] } } as Request,
      {} as Response,
      ((error?: unknown) => {
        allowedError = error;
      }) as NextFunction,
    );
    denied(
      { auth: officeUser() } as Request,
      {} as Response,
      ((error?: unknown) => {
        deniedError = error;
      }) as NextFunction,
    );

    assert.equal(allowedError, undefined);
    assert.ok(deniedError instanceof HttpError);
    assert.equal((deniedError as HttpError).status, 403);
  });
});

describe("document file validation", () => {
  it("accepts a PDF whose contents match the declared type", () => {
    const result = validateDocumentFile({
      originalFileName: "invoice 1025.PDF",
      declaredMimeType: "application/pdf",
      buffer: pdfBuffer(),
    });
    assert.notEqual(typeof result, "string");
    if (typeof result !== "string") {
      assert.equal(result.mimeType, "application/pdf");
      assert.equal(result.originalFileName, "invoice 1025.PDF");
      assert.equal(result.safeFileName.endsWith(".pdf"), true);
    }
  });

  it("rejects executable names and executable bytes even when named like a PDF", () => {
    assert.equal(isExecutableFileName("payload.exe"), true);
    assert.equal(isExecutableFileName("notes.pdf"), false);
    const result = validateDocumentFile({
      originalFileName: "invoice.pdf",
      declaredMimeType: "application/pdf",
      buffer: exeDisguisedAsPdf(),
    });
    assert.equal(result, "Only PDF, JPEG, PNG, or WEBP documents are allowed");
    assert.equal(detectDocumentMime(jpegBuffer(), "image/jpeg"), "image/jpeg");
  });

  it("enforces file-size limits", () => {
    const result = validateDocumentFile(
      {
        originalFileName: "invoice.pdf",
        declaredMimeType: "application/pdf",
        buffer: pdfBuffer(),
      },
      { maxBytes: 8 },
    );
    assert.equal(result, "File must be 8 bytes or smaller");
  });

  it("sanitizes path fragments out of filenames", () => {
    assert.equal(sanitizeOriginalFileName("..\\windows\\system32\\invoice.pdf"), "invoice.pdf");
  });
});

describe("document types and transaction association", () => {
  it("accepts configured types and rejects unknown types", () => {
    assert.equal(normalizeDocumentType("delivery challan"), "DELIVERY_CHALLAN");
    assert.equal(isAllowedDocumentType("INVOICE", CATALOG), true);
    assert.equal(parseDocumentTypeInput("gate-pass", CATALOG), "GATE_PASS");
    assert.throws(() => parseDocumentTypeInput("BILL_OF_LADING", CATALOG), (error: unknown) => {
      return error instanceof HttpError && error.status === 400;
    });
  });
});

describe("simulated OCR processing and storage", () => {
  it("returns structured fields, confidence, and a simulated provider", async () => {
    const provider = new SimulatedOCRProvider(() => new Date("2026-09-20T12:00:00.000Z"));
    const result = await provider.extract({
      documentId: "doc1025",
      documentType: "INVOICE",
      originalFileName: "invoice.pdf",
      mimeType: "application/pdf",
      registeredVehicleNumber: "AP39XX1234",
      anprVehicleNumber: "AP39XX1234",
    });

    assert.equal(result.source, "SIMULATED");
    assert.equal(result.provider, "simulated-ocr");
    assert.match(result.rawText, /SIMULATED OCR OUTPUT/);
    const vehicle = result.fields.find((field) => field.name === "vehicleNumber");
    const material = result.fields.find((field) => field.name === "materialName");
    assert.equal(vehicle?.value, "AP39XX1234");
    assert.equal(vehicle?.confidence, 0.96);
    assert.equal(material?.value, "Cement");
    assert.equal(material?.confidence, 0.89);
    assert.ok((vehicle?.confidence ?? 1) < 1);
  });

  it("stores OCR fields separately from raw text", () => {
    const uploaded = createUploadedExtractedData({ sizeBytes: 2048, storageProvider: "local-development" });
    const stored = applyOcrResult(uploaded, sampleOcr("AP39XX1234"), {
      anprVehicleNumber: "AP39XX1234",
      registeredVehicleNumber: "AP39XX1234",
    });

    assert.equal(stored.file.sizeBytes, 2048);
    assert.equal(stored.ocr?.provider, "simulated-ocr");
    assert.equal(stored.ocr?.fields.length, 6);
    assert.match(stored.ocr?.rawText ?? "", /vehicleNumber=AP39XX1234/);
    assert.equal(stored.vehicleComparison?.result, "MATCH");
  });
});

describe("vehicle-number comparison", () => {
  it("returns MATCH when ANPR, OCR, and registered plates agree", () => {
    const comparison = compareVehicleNumbers({
      anprVehicleNumber: "ap39 xx 1234",
      ocrVehicleNumber: "AP39XX1234",
      registeredVehicleNumber: "AP39XX1234",
    });
    assert.equal(comparison.result, "MATCH");
  });

  it("returns NEEDS_REVIEW when any plate differs and does not call it fraud", () => {
    const comparison = compareVehicleNumbers({
      anprVehicleNumber: "AP39XX1234",
      ocrVehicleNumber: "TS09EA9999",
      registeredVehicleNumber: "AP39XX1234",
    });
    assert.equal(comparison.result, "NEEDS_REVIEW");
    assert.equal(comparison.ocrVehicleNumber, "TS09EA9999");
  });

  it("simulates a mismatch from the OCR provider when requested", async () => {
    const provider = new SimulatedOCRProvider();
    const result = await provider.extract({
      documentId: "doc1",
      documentType: "INVOICE",
      originalFileName: "mismatch-invoice.pdf",
      mimeType: "application/pdf",
      registeredVehicleNumber: "AP39XX1234",
    });
    const vehicle = result.fields.find((field) => field.name === "vehicleNumber");
    assert.equal(vehicle?.value, "TS09EA9999");
  });
});

describe("human review and document verification", () => {
  it("lets an authorized reviewer correct a low-confidence field", () => {
    const uploaded = createUploadedExtractedData({ sizeBytes: 100, storageProvider: "local-development" });
    const extracted = applyOcrResult(uploaded, sampleOcr("AP39XX1234"), {
      registeredVehicleNumber: "AP39XX1234",
    });
    const reviewed = applyFieldCorrections(extracted, { materialName: "Pozzolana Cement" }, {
      registeredVehicleNumber: "AP39XX1234",
    });
    const material = reviewed.ocr?.fields.find((field) => field.name === "materialName");
    assert.equal(material?.value, "Pozzolana Cement");
    assert.equal(material?.originalValue, "Cement");
    assert.equal(material?.corrected, true);
    assert.equal(material?.confidence, 0.89);
  });

  it("parses verify and reject decisions", () => {
    assert.equal(parseVerifyDocumentInput({ decision: "VERIFIED" }).decision, "VERIFIED");
    assert.equal(parseVerifyDocumentInput({ decision: "REJECTED", note: "Unreadable" }).note, "Unreadable");
    assert.throws(() => parseVerifyDocumentInput({ decision: "FRAUD" }), (error: unknown) => {
      return error instanceof HttpError && error.status === 400;
    });
  });

  it("exposes review actions only after extraction", () => {
    assert.deepEqual(documentAllowedActions(DocumentStatus.UPLOADED, "NOT_STARTED"), ["process"]);
    assert.deepEqual(documentAllowedActions(DocumentStatus.EXTRACTED, "SIMULATED"), ["review", "verify", "reject"]);
  });
});

describe("transaction state for documents", () => {
  it("keeps the Step 5 first-weighment path and adds the document path", () => {
    assert.equal(canTransition(TransactionStatus.IDENTIFIED, TransactionStatus.FIRST_WEIGHMENT), true);
    assert.equal(canTransition(TransactionStatus.IDENTIFIED, TransactionStatus.DOCUMENT_PENDING), true);
    assert.equal(canTransition(TransactionStatus.DOCUMENT_PENDING, TransactionStatus.DOCUMENT_VERIFIED), true);
    assert.equal(canTransition(TransactionStatus.DOCUMENT_VERIFIED, TransactionStatus.FIRST_WEIGHMENT), true);
    assert.equal(canTransition(TransactionStatus.DOCUMENT_PENDING, TransactionStatus.FIRST_WEIGHMENT), false);
    assert.deepEqual(allowedActions(TransactionStatus.IDENTIFIED, false), ["upload_document", "record_gross"]);
    assert.deepEqual(allowedActions(TransactionStatus.DOCUMENT_PENDING, false), ["upload_document"]);
    assert.deepEqual(allowedActions(TransactionStatus.DOCUMENT_VERIFIED, false), ["record_gross"]);
  });

  it("rejects document upload and verification in invalid transaction states", () => {
    assert.throws(() => assertCanUploadForTransaction(TransactionStatus.ARRIVED), (error: unknown) => {
      return error instanceof HttpError && error.status === 409;
    });
    assert.throws(() => assertCanUploadForTransaction(TransactionStatus.FIRST_WEIGHMENT), (error: unknown) => {
      return error instanceof HttpError && error.status === 409;
    });
    assert.throws(() => assertCanVerifyForTransaction(TransactionStatus.IDENTIFIED), (error: unknown) => {
      return error instanceof HttpError && error.status === 409;
    });
    assertCanUploadForTransaction(TransactionStatus.IDENTIFIED);
    assertCanVerifyForTransaction(TransactionStatus.DOCUMENT_PENDING);
  });
});

describe("audit logging and document access", () => {
  it("defines document and OCR audit actions without credential fields", () => {
    assert.equal(AUDIT_ACTIONS.DOCUMENT_UPLOADED, "DOCUMENT_UPLOADED");
    assert.equal(AUDIT_ACTIONS.OCR_STARTED, "OCR_STARTED");
    assert.equal(AUDIT_ACTIONS.OCR_COMPLETED, "OCR_COMPLETED");
    assert.equal(AUDIT_ACTIONS.OCR_FAILED, "OCR_FAILED");
    assert.equal(AUDIT_ACTIONS.DOCUMENT_REVIEWED, "DOCUMENT_REVIEWED");
    assert.equal(AUDIT_ACTIONS.DOCUMENT_VERIFIED, "DOCUMENT_VERIFIED");
    assert.equal(AUDIT_ACTIONS.DOCUMENT_REJECTED, "DOCUMENT_REJECTED");
    assert.equal("PASSWORD" in AUDIT_ACTIONS, false);
    assert.equal("JWT_SECRET" in AUDIT_ACTIONS, false);
  });

  it("requires transaction.read to view documents", () => {
    const middleware = requirePermission("transaction.read");
    let captured: unknown;
    middleware(
      { auth: { ...officeUser(), permissions: [] } } as Request,
      {} as Response,
      ((error?: unknown) => {
        captured = error;
      }) as NextFunction,
    );
    assert.ok(captured instanceof HttpError);
    assert.equal((captured as HttpError).status, 403);
  });
});

describe("local development storage", () => {
  it("stores files outside source folders and rejects path traversal", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "trinetra-docs-"));
    const storage = new LocalDevelopmentStorage(root);
    try {
      const stored = await storage.store({
        organizationId: "org1",
        transactionId: "txn1",
        documentId: "doc1",
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
        bytes: pdfBuffer(),
      });
      assert.equal(stored.key.includes(".."), false);
      assert.equal(path.isAbsolute(stored.key), false);
      const bytes = await storage.read(stored.key);
      assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
      await assert.rejects(() => storage.read("../secret.pdf"), (error: unknown) => {
        return error instanceof HttpError && error.status === 400;
      });
      const written = await readFile(path.join(root, stored.key));
      assert.equal(written.equals(bytes), true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("process and review validators", () => {
  it("accepts optional ANPR input for simulated comparison", () => {
    const processed = parseProcessDocumentInput({ anprVehicleNumber: "AP39XX1234", forceVehicleMismatch: true });
    assert.equal(processed.anprVehicleNumber, "AP39XX1234");
    assert.equal(processed.forceVehicleMismatch, true);
    const reviewed = parseReviewDocumentInput({ fields: { vehicleNumber: "AP39XX1234" } });
    assert.equal(reviewed.fields.vehicleNumber, "AP39XX1234");
  });
});
