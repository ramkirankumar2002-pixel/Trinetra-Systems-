import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransactionStatus, UnloadingStatus, WorkflowCapability } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { calculateNetWeight, kgToMilligrams, milligramsToKgDecimal } from "../src/domain/netWeight.js";
import { assertTransactionMutable } from "../src/domain/transactionMutability.js";
import { canTransition } from "../src/domain/transactionState.js";
import { mergeTimeline } from "../src/domain/transactionTimeline.js";
import { selectUnloadingPoint } from "../src/domain/unloadingAssignment.js";
import { parseWeightKg } from "../src/domain/weight.js";
import {
  assertCanAssignUnloading,
  assertCanCompleteUnloading,
  assertCanFinalize,
  assertCanRecordSecondWeighment,
  assertCanStartUnloading,
  resolveAllowedActions,
  resolveNextAction,
  type WorkflowProgressContext,
} from "../src/domain/workflowEngine.js";
import { buildWorkflowSnapshot, type WorkflowSnapshot } from "../src/domain/workflowSnapshot.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { parseUnloadingPointCreateInput } from "../src/modules/unloadingPoints/validators.js";
import {
  parseAssignUnloadingInput,
  parseCorrectionInput,
  parseWeighmentInput,
} from "../src/modules/transactions/validators.js";

function snapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return buildWorkflowSnapshot({
    assignmentId: "asg_1",
    material: { id: "mat_cement", code: "CEMENT", name: "Cement", unitOfMeasure: "MT" },
    workflow: { id: "wf_2", code: "TYPE_2", name: "Demo Type 2" },
    config: { autoContinue: false, approvalThresholdKg: null },
    steps: [
      { sortOrder: 1, capability: WorkflowCapability.IDENTIFY_VEHICLE, name: "Identify vehicle", isRequired: true, approvalDepartment: null },
      { sortOrder: 3, capability: WorkflowCapability.VERIFY_DOCUMENTS, name: "Verify documents", isRequired: true, approvalDepartment: null },
      { sortOrder: 4, capability: WorkflowCapability.CLASSIFY_MATERIAL, name: "Classify material", isRequired: true, approvalDepartment: null },
      { sortOrder: 5, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment", isRequired: true, approvalDepartment: null },
      {
        sortOrder: 6,
        capability: WorkflowCapability.APPROVAL,
        name: "Store approval",
        isRequired: true,
        approvalDepartment: { id: "dep_store", code: "STORE", name: "Store" },
      },
      { sortOrder: 7, capability: WorkflowCapability.UNLOAD, name: "Unload", isRequired: true, approvalDepartment: null },
      { sortOrder: 8, capability: WorkflowCapability.SECOND_WEIGHMENT, name: "Second weighment", isRequired: true, approvalDepartment: null },
      { sortOrder: 9, capability: WorkflowCapability.COMPLETE, name: "Complete", isRequired: true, approvalDepartment: null },
    ],
    source: "MANUAL",
    ocrMaterialName: null,
    ocrConfidence: null,
    identificationStatus: "MATCHED",
    ...overrides,
  });
}

function context(overrides: Partial<WorkflowProgressContext> = {}): WorkflowProgressContext {
  return {
    status: TransactionStatus.APPROVED,
    hasVehicle: true,
    hasGross: true,
    hasTare: false,
    hasDocument: true,
    hasVerifiedDocument: true,
    snapshot: snapshot(),
    grossWeightKg: 35000,
    netWeightKg: null,
    tareExceedsGross: false,
    hasUnloadingPoint: false,
    unloadingStatus: null,
    isCompleted: false,
    approvedStepSortOrders: [6],
    rejectedStepSortOrders: [],
    pendingApproval: null,
    ...overrides,
  };
}

function point(id: string, code: string, extras: Partial<Parameters<typeof selectUnloadingPoint>[0]["points"][number]> = {}) {
  return {
    id,
    siteId: "site_a",
    code,
    name: code,
    status: "AVAILABLE" as const,
    isActive: true,
    allowedMaterialIds: [],
    sortOrder: 1,
    ...extras,
  };
}

function callPermission(permission: string, auth: AuthenticatedUser): unknown {
  let caught: unknown;
  requirePermission(permission)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      caught = error;
    }) as NextFunction,
  );
  return caught;
}

function operator(permissions: string[]): AuthenticatedUser {
  return {
    id: "user_wb",
    fullName: "Weighbridge Operator",
    email: "weighbridge@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_wb", code: "WEIGHBRIDGE", name: "Weighbridge" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role_wb", code: "WEIGHBRIDGE_OPERATOR", name: "Weighbridge Operator", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions,
    organizationId: "org",
    sessionId: "session",
  };
}

describe("unloading point creation and assignment", () => {
  it("creates an unloading point from a valid payload", () => {
    const parsed = parseUnloadingPointCreateInput({
      siteId: "site_a",
      code: "UP-03",
      name: "Unloading Point 03",
      status: "AVAILABLE",
    });
    assert.equal(parsed.code, "UP-03");
    assert.equal(parsed.name, "Unloading Point 03");
    assert.equal(parsed.status, "AVAILABLE");
  });

  it("selects a configured material rule instead of hard-coding cement", () => {
    const selected = selectUnloadingPoint({
      siteId: "site_a",
      materialId: "mat_cement",
      points: [point("p1", "UP-01", { sortOrder: 1 }), point("p3", "UP-03", { sortOrder: 3 })],
      rules: [
        { id: "r1", siteId: "site_a", materialId: "mat_cement", unloadingPointId: "p3", priority: 10, isActive: true },
      ],
    });
    assert.equal(selected?.code, "UP-03");
  });

  it("falls back to the first available point when no rule matches", () => {
    const selected = selectUnloadingPoint({
      siteId: "site_a",
      materialId: "mat_sand",
      points: [point("p2", "UP-02", { sortOrder: 2 }), point("p1", "UP-01", { sortOrder: 1 })],
      rules: [],
    });
    assert.equal(selected?.code, "UP-01");
  });

  it("ignores inactive or occupied points", () => {
    const selected = selectUnloadingPoint({
      siteId: "site_a",
      materialId: "mat_cement",
      points: [
        point("p1", "UP-01", { status: "OCCUPIED" }),
        point("p2", "UP-02", { isActive: false, status: "INACTIVE" }),
        point("p3", "UP-03"),
      ],
      rules: [],
    });
    assert.equal(selected?.code, "UP-03");
  });
});

describe("unloading authorization and state gates", () => {
  it("blocks unauthorized assignment", () => {
    const error = callPermission("unloading.assign", operator(["transaction.read"]));
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
  });

  it("allows assignment after required approval", () => {
    assert.equal(assertCanAssignUnloading(context()), null);
    assert.ok(resolveAllowedActions(context()).includes("assign_unloading"));
  });

  it("blocks assignment when approval is missing", () => {
    const blocked = assertCanAssignUnloading(
      context({
        approvedStepSortOrders: [],
        status: TransactionStatus.PENDING_APPROVAL,
        pendingApproval: { id: "apr_1", sortOrder: 6, departmentName: "Store" },
      }),
    );
    assert.equal(blocked, "Required approval is incomplete");
  });

  it("blocks assignment when document verification is missing", () => {
    const blocked = assertCanAssignUnloading(context({ hasVerifiedDocument: false, hasDocument: false }));
    assert.equal(blocked, "Required document verification is incomplete");
  });

  it("blocks start unloading in an invalid state", () => {
    assert.equal(assertCanStartUnloading(context({ hasUnloadingPoint: true })), null);
    assert.ok(
      assertCanStartUnloading(context({ hasUnloadingPoint: true, status: TransactionStatus.PENDING_APPROVAL })),
    );
    assert.equal(assertCanCompleteUnloading(context()), "Unloading can only be completed while it is in progress");
    assert.equal(
      assertCanCompleteUnloading(
        context({
          status: TransactionStatus.UNLOADING,
          unloadingStatus: UnloadingStatus.IN_PROGRESS,
          hasUnloadingPoint: true,
        }),
      ),
      null,
    );
  });
});

describe("second weighment and net weight", () => {
  it("records a valid second weighment only after unload", () => {
    assert.equal(
      assertCanRecordSecondWeighment(
        context({
          status: TransactionStatus.UNLOADED,
          hasUnloadingPoint: true,
          unloadingStatus: UnloadingStatus.COMPLETED,
        }),
      ),
      null,
    );
    assert.equal(
      assertCanRecordSecondWeighment(context({ status: TransactionStatus.APPROVED, hasUnloadingPoint: true })),
      "Second weighment can only be recorded after unloading is completed",
    );
  });

  it("rejects a duplicate second weighment", () => {
    const blocked = assertCanRecordSecondWeighment(
      context({
        status: TransactionStatus.UNLOADED,
        hasTare: true,
        unloadingStatus: UnloadingStatus.COMPLETED,
        hasUnloadingPoint: true,
      }),
    );
    assert.equal(blocked, "A second weighment has already been recorded");
  });

  it("rejects invalid and negative weights", () => {
    assert.equal(parseWeightKg(-1), "Weight cannot be negative");
    assert.equal(parseWeightKg(0), "Weight must be greater than zero");
    assert.equal(parseWeightKg("abc"), "Weight must be a positive number in kilograms");
    const parsed = parseWeightKg("15000");
    assert.notEqual(typeof parsed, "string");
  });

  it("calculates net weight with milligram integer arithmetic", () => {
    const result = calculateNetWeight("35000.000", "15000.000");
    assert.equal(result.netAsDecimal, "20000.000");
    assert.equal(result.tareExceedsGross, false);
    assert.equal(kgToMilligrams("35000.250") - kgToMilligrams("15000.125"), 20000125n);
    assert.equal(milligramsToKgDecimal(20000125n), "20000.125");
  });

  it("flags tare greater than gross as an exception, not completion", () => {
    const result = calculateNetWeight("15000.000", "35000.000");
    assert.equal(result.tareExceedsGross, true);
    assert.equal(result.netAsDecimal, "-20000.000");
    assert.equal(canTransition(TransactionStatus.UNLOADED, TransactionStatus.EXCEPTION), true);
    assert.equal(
      assertCanFinalize(
        context({
          status: TransactionStatus.SECOND_WEIGHMENT,
          hasTare: true,
          tareExceedsGross: true,
          netWeightKg: "-20000.000",
          unloadingStatus: UnloadingStatus.COMPLETED,
          hasUnloadingPoint: true,
        }),
      ),
      "This transaction has a weight exception and needs review before completion",
    );
  });
});

describe("finalization, completed protection, and happy path", () => {
  it("blocks finalize when unloading is incomplete", () => {
    const blocked = assertCanFinalize(
      context({
        status: TransactionStatus.SECOND_WEIGHMENT,
        hasTare: true,
        netWeightKg: "20000.000",
        unloadingStatus: UnloadingStatus.IN_PROGRESS,
        hasUnloadingPoint: true,
      }),
    );
    assert.equal(blocked, "Unloading must be completed before finalization");
  });

  it("allows finalize only when every gate passes", () => {
    const ready = context({
      status: TransactionStatus.SECOND_WEIGHMENT,
      hasTare: true,
      netWeightKg: "20000.000",
      unloadingStatus: UnloadingStatus.COMPLETED,
      hasUnloadingPoint: true,
    });
    assert.equal(assertCanFinalize(ready), null);
    assert.ok(resolveAllowedActions(ready).includes("finalize"));
  });

  it("protects completed transactions from ordinary edits", () => {
    assert.equal(
      assertTransactionMutable(TransactionStatus.COMPLETED),
      "Completed transactions cannot be changed. Request a controlled correction.",
    );
    assert.equal(canTransition(TransactionStatus.COMPLETED, TransactionStatus.UNLOADING), false);
    assert.deepEqual(
      resolveAllowedActions(
        context({
          status: TransactionStatus.COMPLETED,
          isCompleted: true,
          hasTare: true,
          netWeightKg: "20000.000",
          unloadingStatus: UnloadingStatus.COMPLETED,
          hasUnloadingPoint: true,
        }),
      ),
      [],
    );
  });

  it("walks the happy path from approval through completion", () => {
    const approved = context();
    assert.equal(resolveNextAction(approved).code, "assign_unloading");

    const assigned = context({ hasUnloadingPoint: true, unloadingStatus: UnloadingStatus.NOT_STARTED });
    assert.equal(resolveNextAction(assigned).code, "start_unloading");
    assert.equal(resolveNextAction(assigned).label, "Ready for unloading");

    const unloading = context({
      status: TransactionStatus.UNLOADING,
      hasUnloadingPoint: true,
      unloadingStatus: UnloadingStatus.IN_PROGRESS,
    });
    assert.equal(resolveNextAction(unloading).code, "complete_unloading");

    const unloaded = context({
      status: TransactionStatus.UNLOADED,
      hasUnloadingPoint: true,
      unloadingStatus: UnloadingStatus.COMPLETED,
    });
    assert.equal(resolveNextAction(unloaded).code, "record_tare");

    const weighed = context({
      status: TransactionStatus.SECOND_WEIGHMENT,
      hasTare: true,
      netWeightKg: "20000.000",
      hasUnloadingPoint: true,
      unloadingStatus: UnloadingStatus.COMPLETED,
    });
    assert.equal(resolveNextAction(weighed).code, "finalize");

    const done = context({
      status: TransactionStatus.COMPLETED,
      isCompleted: true,
      hasTare: true,
      netWeightKg: "20000.000",
      hasUnloadingPoint: true,
      unloadingStatus: UnloadingStatus.COMPLETED,
    });
    assert.equal(resolveNextAction(done).code, "completed");
  });
});

describe("audit, authorization, timeline, and correction foundation", () => {
  it("records the Step 9 audit vocabulary", () => {
    assert.equal(AUDIT_ACTIONS.UNLOADING_POINT_ASSIGNED, "UNLOADING_POINT_ASSIGNED");
    assert.equal(AUDIT_ACTIONS.UNLOADING_STARTED, "UNLOADING_STARTED");
    assert.equal(AUDIT_ACTIONS.UNLOADING_COMPLETED, "UNLOADING_COMPLETED");
    assert.equal(AUDIT_ACTIONS.SECOND_WEIGHMENT_RECORDED, "SECOND_WEIGHMENT_RECORDED");
    assert.equal(AUDIT_ACTIONS.NET_WEIGHT_CALCULATED, "NET_WEIGHT_CALCULATED");
    assert.equal(AUDIT_ACTIONS.TRANSACTION_COMPLETED, "TRANSACTION_COMPLETED");
    assert.equal(AUDIT_ACTIONS.TRANSACTION_EXCEPTION, "TRANSACTION_EXCEPTION");
    assert.equal(AUDIT_ACTIONS.TRANSACTION_CORRECTION_REQUESTED, "TRANSACTION_CORRECTION_REQUESTED");
  });

  it("separates assign, manage, finalize, and correct permissions", () => {
    assert.equal(callPermission("unloading.assign", operator(["unloading.assign"])), undefined);
    assert.ok(callPermission("unloading.manage", operator(["unloading.assign"])) instanceof HttpError);
    assert.ok(callPermission("transaction.finalize", operator(["weighment.record"])) instanceof HttpError);
    assert.equal(callPermission("transaction.finalize", operator(["transaction.finalize"])), undefined);
    assert.equal(callPermission("transaction.correct", operator(["transaction.correct"])), undefined);
  });

  it("extends the timeline with unloading and completion events", () => {
    const items = mergeTimeline(
      [{ label: "Vehicle arrived", at: "2026-09-20T04:50:00.000Z", status: "ARRIVED" }],
      [
        { action: "UNLOADING_POINT_ASSIGNED", at: "2026-09-20T05:02:00.000Z", metadata: { pointCode: "UP-03" } },
        { action: "UNLOADING_STARTED", at: "2026-09-20T05:05:00.000Z", metadata: null },
        { action: "UNLOADING_COMPLETED", at: "2026-09-20T05:20:00.000Z", metadata: null },
        { action: "SECOND_WEIGHMENT_RECORDED", at: "2026-09-20T05:22:00.000Z", metadata: null },
        { action: "NET_WEIGHT_CALCULATED", at: "2026-09-20T05:22:01.000Z", metadata: null },
        { action: "TRANSACTION_COMPLETED", at: "2026-09-20T05:24:00.000Z", metadata: null },
      ],
    );
    assert.equal(items.some((item) => item.label === "Unloading point assigned: UP-03"), true);
    assert.equal(items.some((item) => item.label === "Transaction completed"), true);
  });

  it("accepts a correction request payload without applying values", () => {
    const parsed = parseCorrectionInput({
      field: "TARE_WEIGHT",
      originalValue: "15000.000",
      proposedValue: "14800.000",
      reason: "Scale reprint after operator review",
    });
    assert.equal(parsed.field, "TARE_WEIGHT");
    assert.equal(parseAssignUnloadingInput({}).unloadingPointId, undefined);
    const weighment = parseWeighmentInput({ weightKg: "15000", source: "SIMULATED", kind: "TARE" });
    assert.equal(weighment.kind, "TARE");
  });
});
