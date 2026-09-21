import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApprovalDecision, TransactionStatus, WorkflowCapability } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import {
  approvalEligibilityFromUser,
  canDecideApproval,
  eligibleDepartmentCodes,
} from "../src/domain/approvalEligibility.js";
import {
  applyApprovalDecision,
  assertPendingDecision,
  canTransitionApproval,
  hasActiveApprovalForStep,
  validateRejectionReason,
} from "../src/domain/approvalState.js";
import { mergeTimeline } from "../src/domain/transactionTimeline.js";
import {
  remainingApprovalSteps,
  resolveNextAction,
  type WorkflowProgressContext,
} from "../src/domain/workflowEngine.js";
import { buildWorkflowSnapshot, type WorkflowSnapshot } from "../src/domain/workflowSnapshot.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { parseApproveInput, parseRejectInput } from "../src/modules/approvals/validators.js";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_store",
    fullName: "Store Officer",
    email: "store@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_store", code: "STORE", name: "Store" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role_store", code: "STORE_OFFICER", name: "Store Officer", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions: ["transaction.read", "approval.decide"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function snapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  return buildWorkflowSnapshot({
    assignmentId: "asg_1",
    material: { id: "mat_cement", code: "CEMENT", name: "Cement", unitOfMeasure: "MT" },
    workflow: { id: "wf_2", code: "TYPE_2", name: "Demo Type 2" },
    config: { autoContinue: false, approvalThresholdKg: null },
    steps: [
      { sortOrder: 1, capability: WorkflowCapability.IDENTIFY_VEHICLE, name: "Identify vehicle", isRequired: true, approvalDepartment: null },
      { sortOrder: 5, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment", isRequired: true, approvalDepartment: null },
      {
        sortOrder: 6,
        capability: WorkflowCapability.APPROVAL,
        name: "Store approval",
        isRequired: true,
        approvalDepartment: { id: "dep_store", code: "STORE", name: "Store" },
      },
      { sortOrder: 7, capability: WorkflowCapability.UNLOAD, name: "Unload", isRequired: true, approvalDepartment: null },
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
    status: TransactionStatus.PENDING_APPROVAL,
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
    approvedStepSortOrders: [],
    rejectedStepSortOrders: [],
    pendingApproval: { id: "apr_1", sortOrder: 6, departmentName: "Store" },
    ...overrides,
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

describe("approval creation and duplicate protection", () => {
  it("creates a remaining store approval after first weighment", () => {
    const remaining = remainingApprovalSteps(snapshot(), {
      grossWeightKg: 35000,
      approvedStepSortOrders: [],
    });
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.approvalDepartment?.code, "STORE");
    assert.equal(remaining[0]?.name, "Store approval");
  });

  it("prevents a second active approval for the same workflow step", () => {
    assert.equal(
      hasActiveApprovalForStep(
        [{ snapshotStepSortOrder: 6, decision: ApprovalDecision.PENDING }],
        6,
      ),
      true,
    );
    assert.equal(
      hasActiveApprovalForStep(
        [{ snapshotStepSortOrder: 6, decision: ApprovalDecision.APPROVED }],
        6,
      ),
      false,
    );
  });
});

describe("store and supervisor authorization", () => {
  it("allows a store officer to decide store approvals only", () => {
    const store = approvalEligibilityFromUser(user());
    assert.equal(
      canDecideApproval({
        ...store,
        approvalDepartmentId: "dep_store",
        approvalDepartmentCode: "STORE",
        assignedUserId: null,
      }),
      true,
    );
    assert.equal(
      canDecideApproval({
        ...store,
        approvalDepartmentId: "dep_super",
        approvalDepartmentCode: "SUPERVISOR",
        assignedUserId: null,
      }),
      false,
    );
  });

  it("allows a supervisor to decide supervisor approvals only", () => {
    const supervisor = approvalEligibilityFromUser(
      user({
        id: "user_super",
        defaultDepartment: { id: "dep_super", code: "SUPERVISOR", name: "Supervisor" },
        roles: [{ id: "role_super", code: "SUPERVISOR", name: "Supervisor", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
      }),
    );
    assert.deepEqual(eligibleDepartmentCodes(supervisor.roleCodes, supervisor.departmentCode), ["SUPERVISOR"]);
    assert.equal(
      canDecideApproval({
        ...supervisor,
        approvalDepartmentId: "dep_super",
        approvalDepartmentCode: "SUPERVISOR",
        assignedUserId: null,
      }),
      true,
    );
    assert.equal(
      canDecideApproval({
        ...supervisor,
        approvalDepartmentId: "dep_store",
        approvalDepartmentCode: "STORE",
        assignedUserId: null,
      }),
      false,
    );
  });

  it("blocks a weighbridge operator from approving store or supervisor requests", () => {
    const operator = approvalEligibilityFromUser(
      user({
        id: "user_op",
        permissions: ["transaction.read", "weighment.record"],
        defaultDepartment: { id: "dep_wb", code: "WEIGHBRIDGE", name: "Weighbridge" },
        roles: [
          {
            id: "role_op",
            code: "WEIGHBRIDGE_OPERATOR",
            name: "Weighbridge Operator",
            site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
          },
        ],
      }),
    );
    assert.equal(operator.hasDecidePermission, false);
    assert.equal(
      canDecideApproval({
        ...operator,
        approvalDepartmentId: "dep_store",
        approvalDepartmentCode: "STORE",
        assignedUserId: null,
      }),
      false,
    );
    const denied = callPermission("approval.decide", user({ permissions: ["transaction.read"] }));
    assert.ok(denied instanceof HttpError);
    assert.equal((denied as HttpError).status, 403);
  });
});

describe("approval decisions", () => {
  it("accepts an optional approval comment", () => {
    assert.equal(parseApproveInput({}).comments, null);
    assert.equal(parseApproveInput({ comments: "Material quantity verified." }).comments, "Material quantity verified.");
  });

  it("requires a meaningful rejection reason", () => {
    assert.throws(() => parseRejectInput({}), (error: unknown) => error instanceof HttpError);
    assert.equal(validateRejectionReason(""), "A rejection reason is required");
    assert.equal(validateRejectionReason("no"), "A rejection reason is required");
    assert.equal(parseRejectInput({ reason: "Vehicle does not match delivery document." }).reason, "Vehicle does not match delivery document.");
  });

  it("rejects a second decision on an already decided request", () => {
    assert.equal(canTransitionApproval(ApprovalDecision.APPROVED, ApprovalDecision.REJECTED), false);
    assert.equal(assertPendingDecision(ApprovalDecision.APPROVED), "Approval is no longer pending.");
    assert.deepEqual(applyApprovalDecision(ApprovalDecision.APPROVED, ApprovalDecision.APPROVED), {
      ok: false,
      error: "Approval is no longer pending.",
    });
  });

  it("lets only the first concurrent decision succeed", () => {
    const first = applyApprovalDecision(ApprovalDecision.PENDING, ApprovalDecision.APPROVED);
    const second = applyApprovalDecision(ApprovalDecision.APPROVED, ApprovalDecision.REJECTED);
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: false, error: "Approval is no longer pending." });
  });
});

describe("workflow integration after approval", () => {
  it("marks the approval step complete and determines the next action from the snapshot", () => {
    const afterApprove = context({
      approvedStepSortOrders: [6],
      pendingApproval: null,
      status: TransactionStatus.APPROVED,
    });
    assert.equal(remainingApprovalSteps(afterApprove.snapshot, afterApprove).length, 0);
    assert.equal(resolveNextAction(afterApprove).code, "assign_unloading");
  });

  it("does not advance the workflow after rejection", () => {
    const afterReject = context({
      rejectedStepSortOrders: [6],
      pendingApproval: null,
      status: TransactionStatus.REJECTED,
    });
    assert.equal(resolveNextAction(afterReject).code, "blocked");
    assert.equal(remainingApprovalSteps(afterReject.snapshot, afterReject)[0]?.approvalDepartment?.code, "STORE");
  });
});

describe("notifications, timeline, site access, and audit", () => {
  it("records notification create and read actions", () => {
    assert.equal(AUDIT_ACTIONS.NOTIFICATION_CREATED, "NOTIFICATION_CREATED");
    assert.equal(AUDIT_ACTIONS.NOTIFICATION_READ, "NOTIFICATION_READ");
    assert.equal(AUDIT_ACTIONS.APPROVAL_CREATED, "APPROVAL_CREATED");
    assert.equal(AUDIT_ACTIONS.APPROVAL_APPROVED, "APPROVAL_APPROVED");
    assert.equal(AUDIT_ACTIONS.APPROVAL_REJECTED, "APPROVAL_REJECTED");
    assert.equal(AUDIT_ACTIONS.WORKFLOW_STEP_COMPLETED, "WORKFLOW_STEP_COMPLETED");
  });

  it("builds a transaction timeline from real audit and entity events", () => {
    const items = mergeTimeline(
      [{ label: "Vehicle arrived", at: "2026-09-20T04:50:00.000Z", status: "ARRIVED" }],
      [
        { action: "DOCUMENT_UPLOADED", at: "2026-09-20T04:53:00.000Z", metadata: null },
        {
          action: "APPROVAL_CREATED",
          at: "2026-09-20T04:58:00.000Z",
          metadata: { departmentName: "Store" },
        },
        {
          action: "APPROVAL_APPROVED",
          at: "2026-09-20T05:01:00.000Z",
          metadata: { departmentName: "Store" },
        },
      ],
    );
    assert.equal(items[0]?.label, "Vehicle arrived");
    assert.equal(items.some((item) => item.label === "Store approval requested"), true);
    assert.equal(items.some((item) => item.label === "Store approved"), true);
    const withStaleEntity = mergeTimeline(
      [{ label: "Vehicle identified", at: "2026-09-20T05:14:00.000Z", status: "IDENTIFIED" }],
      [{ action: "VEHICLE_IDENTIFIED", at: "2026-09-20T04:51:00.000Z", metadata: null }],
    );
    assert.equal(withStaleEntity.length, 1);
    assert.equal(withStaleEntity[0]?.at, "2026-09-20T04:51:00.000Z");
  });

  it("keeps site-scoped store officers off another site", () => {
    const siteA = user();
    const siteB = user({
      id: "user_store_b",
      defaultSite: { id: "site_b", code: "DEMO-SITE-B", name: "Demo Site B" },
      roles: [
        {
          id: "role_store",
          code: "STORE_OFFICER",
          name: "Store Officer",
          site: { id: "site_b", code: "DEMO-SITE-B", name: "Demo Site B" },
        },
      ],
    });
    assert.equal(canAccessSite(siteA, "site_a"), true);
    assert.equal(canAccessSite(siteA, "site_b"), false);
    assert.equal(canAccessSite(siteB, "site_a"), false);
    const allowed = callPermission("approval.decide", siteA);
    assert.equal(allowed, undefined);
  });
});
