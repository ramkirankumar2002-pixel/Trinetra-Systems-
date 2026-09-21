import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { DRIVER_AUDIT_ACTIONS, isDriverAuditAction } from "../src/domain/driverAudit.js";
import { resolveDriverConfig, isDriverLocale } from "../src/domain/driverConfig.js";
import { canTransition, isOpenWeighbridgeStatus } from "../src/domain/transactionState.js";
import { resolveNextAction, type WorkflowProgressContext } from "../src/domain/workflowEngine.js";
import { TransactionStatus, UnloadingStatus } from "@prisma/client";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { parseDriverEventInput } from "../src/modules/driver/validators.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { HttpError } from "../src/lib/httpError.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";

function user(permissions: string[]): AuthenticatedUser {
  return {
    id: "user_1",
    fullName: "Operator",
    email: "operator@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep", code: "WEIGHBRIDGE", name: "Weighbridge" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions,
    organizationId: "org",
    sessionId: "session",
  };
}

function denyStatus(code: string, auth: AuthenticatedUser): number | undefined {
  const middleware = requirePermission(code);
  let captured: HttpError | undefined;
  middleware({ auth } as Request, {} as Response, ((error?: unknown) => {
    if (error instanceof HttpError) {
      captured = error;
    }
  }) as NextFunction);
  return captured?.status;
}

function progress(overrides: Partial<WorkflowProgressContext> = {}): WorkflowProgressContext {
  return {
    status: TransactionStatus.ARRIVED,
    hasVehicle: false,
    hasGross: false,
    hasTare: false,
    hasDocument: false,
    hasVerifiedDocument: false,
    snapshot: null,
    grossWeightKg: null,
    netWeightKg: null,
    tareExceedsGross: false,
    hasUnloadingPoint: false,
    unloadingStatus: null,
    isCompleted: false,
    approvedStepSortOrders: [],
    rejectedStepSortOrders: [],
    pendingApproval: null,
    ...overrides,
  };
}

describe("driver mode permission and audit", () => {
  it("requires driver.mode and does not treat store officers as drivers", () => {
    assert.equal(denyStatus("driver.mode", user(["driver.mode"])), undefined);
    assert.equal(denyStatus("driver.mode", user(["transaction.read", "approval.decide"])), 403);
    assert.equal(denyStatus("driver.mode", user(["weighbridge.read"])), 403);
  });

  it("whitelists driver audit actions on the existing audit catalog", () => {
    assert.equal(AUDIT_ACTIONS.DRIVER_MODE_OPENED, "DRIVER_MODE_OPENED");
    assert.equal(isDriverAuditAction(DRIVER_AUDIT_ACTIONS.DRIVER_VOICE_REJECTED), true);
    assert.equal(isDriverAuditAction("DROP_DATABASE"), false);
    const parsed = parseDriverEventInput({
      action: "DRIVER_LANGUAGE_CHANGED",
      entityType: "DriverMode",
      entityId: "session",
      metadata: { language: "hi" },
    });
    assert.equal(parsed.action, "DRIVER_LANGUAGE_CHANGED");
    assert.throws(() => parseDriverEventInput({ action: "TRANSACTION_CREATED" }), /not allowed/);
  });
});

describe("driver configuration", () => {
  it("keeps language codes extendable and falls back safely", () => {
    const config = resolveDriverConfig({
      driverModeEnabled: true,
      defaultLanguage: "te",
      languages: ["en", "hi", "te", "xx"],
      voiceEnabled: true,
      audioEnabled: false,
    });
    assert.deepEqual(config.languages, ["en", "hi", "te"]);
    assert.equal(config.defaultLanguage, "te");
    assert.equal(config.audioEnabled, false);
    assert.equal(isDriverLocale("hi"), true);
    assert.equal(isDriverLocale("fr"), false);
  });
});

describe("existing workflow compatibility", () => {
  it("does not change transaction transitions or next-action rules", () => {
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.IDENTIFIED), true);
    assert.equal(canTransition(TransactionStatus.COMPLETED, TransactionStatus.ARRIVED), false);
    assert.equal(isOpenWeighbridgeStatus(TransactionStatus.UNLOADING), true);
    assert.equal(isOpenWeighbridgeStatus(TransactionStatus.COMPLETED), false);
    assert.equal(resolveNextAction(progress()).code, "identify");
    assert.equal(
      resolveNextAction(
        progress({
          status: TransactionStatus.IDENTIFIED,
          hasVehicle: true,
          hasDocument: false,
        }),
      ).code,
      "upload_document",
    );
    assert.equal(
      resolveNextAction(
        progress({
          status: TransactionStatus.UNLOADED,
          hasVehicle: true,
          hasGross: true,
          hasTare: false,
          snapshot: {
            version: 1,
            capturedAt: "2026-09-21T00:00:00.000Z",
            assignmentId: "asg",
            material: { id: "mat", code: "CEM", name: "Cement", unitOfMeasure: "KG" },
            workflow: { id: "wf", code: "T1", name: "Type 1" },
            config: { autoContinue: false, approvalThresholdKg: null },
            steps: [],
            source: "OCR",
            ocrMaterialName: "Cement",
            ocrConfidence: 0.95,
            identificationStatus: "MATCHED",
            verified: true,
            verifiedAt: "2026-09-21T00:00:00.000Z",
            verifiedByUserId: "user_1",
          },
          unloadingStatus: UnloadingStatus.COMPLETED,
          hasUnloadingPoint: true,
        }),
      ).code,
      "record_tare",
    );
  });
});
