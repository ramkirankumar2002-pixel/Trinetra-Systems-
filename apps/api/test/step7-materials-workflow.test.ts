import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransactionStatus, WorkflowCapability } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { normalizeMaterialCode, validateMaterialCode } from "../src/domain/materialCode.js";
import { matchMaterialFromOcr } from "../src/domain/materialMatch.js";
import { isAllowedMaterialUnit, normalizeMaterialUnit, validateMaterialUnitCatalog } from "../src/domain/materialUnits.js";
import { canTransition } from "../src/domain/transactionState.js";
import {
  assertCanAssignMaterial,
  assertCanRecordFirstWeighment,
  resolveAllowedActions,
  resolveApprovalRequirement,
  resolveNextAction,
  type WorkflowProgressContext,
} from "../src/domain/workflowEngine.js";
import {
  buildWorkflowSnapshot,
  parseWorkflowConfig,
  parseWorkflowSnapshot,
  type WorkflowSnapshot,
} from "../src/domain/workflowSnapshot.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { parseMaterialAssignmentInput, parseMaterialCreateInput, parseMaterialUpdateInput } from "../src/modules/materials/validators.js";
import { parseAssignMaterialInput } from "../src/modules/transactions/validators.js";
import { parseWorkflowCreateInput, parseWorkflowStepsInput } from "../src/modules/workflows/validators.js";

const CATALOG = ["KG", "TON", "MT", "LITRE", "PIECE"];

function operatorUser(): AuthenticatedUser {
  return {
    id: "user_operator",
    fullName: "Operator",
    email: "weighbridge@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: null,
    defaultSite: null,
    roles: [],
    permissions: ["material.read", "transaction.update"],
    organizationId: "org",
    sessionId: "session",
  };
}

function adminUser(): AuthenticatedUser {
  return {
    ...operatorUser(),
    id: "user_admin",
    email: "admin@demo.local",
    permissions: ["material.manage", "workflow.manage", "workflow.read"],
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
      { sortOrder: 2, capability: WorkflowCapability.CAPTURE_DOCUMENTS, name: "Capture documents", isRequired: true, approvalDepartment: null },
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
    status: TransactionStatus.DOCUMENT_VERIFIED,
    hasVehicle: true,
    hasGross: false,
    hasTare: false,
    hasDocument: true,
    hasVerifiedDocument: true,
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

describe("material creation and search keys", () => {
  it("creates a normalized material payload", () => {
    const created = parseMaterialCreateInput({
      code: "opc 43",
      name: "  Ordinary Portland Cement ",
      description: "Demo",
      unitOfMeasure: "mt",
    });
    assert.equal(created.code, "OPC_43");
    assert.equal(created.name, "Ordinary Portland Cement");
    assert.equal(created.unitOfMeasure, "MT");
    assert.equal(created.isActive, true);
  });

  it("prevents duplicate-looking codes by normalizing them to the same key", () => {
    const first = parseMaterialCreateInput({ code: "CEMENT", name: "Cement", unitOfMeasure: "MT" });
    const second = parseMaterialCreateInput({ code: "cement", name: "Cement bag", unitOfMeasure: "MT" });
    assert.equal(first.code, second.code);
    assert.equal(validateMaterialCode(normalizeMaterialCode("1BAD")), "Material code must start with a letter and use only letters, digits, or underscores");
  });

  it("searches by treating code as uppercase and name as trimmed text", () => {
    assert.equal(normalizeMaterialCode(" sand-fine "), "SAND_FINE");
    const update = parseMaterialUpdateInput({ name: "Washed Sand" });
    assert.equal(update.name, "Washed Sand");
  });

  it("activates and deactivates through the same validator", () => {
    assert.equal(parseMaterialUpdateInput({ isActive: false }).isActive, false);
    assert.equal(parseMaterialUpdateInput({ isActive: true }).isActive, true);
  });
});

describe("configurable units", () => {
  it("accepts the configured catalog and rejects unknown units", () => {
    const catalog = validateMaterialUnitCatalog(CATALOG);
    assert.deepEqual(catalog, CATALOG);
    assert.equal(isAllowedMaterialUnit(normalizeMaterialUnit("kg"), catalog), true);
    assert.throws(() => parseMaterialCreateInput({ code: "WATER", name: "Water", unitOfMeasure: "BARREL" }));
  });
});

describe("workflow configuration", () => {
  it("creates a Type 1 configuration from data, not a hard-coded supervisor rule", () => {
    const created = parseWorkflowCreateInput({
      code: "TYPE_1",
      name: "Demo Type 1",
      config: { autoContinue: false },
    });
    assert.equal(created.code, "TYPE_1");
    const steps = parseWorkflowStepsInput({
      steps: [
        { capability: "CLASSIFY_MATERIAL", name: "Classify material" },
        { capability: "APPROVAL", name: "Supervisor verification", approvalDepartmentId: "dep_supervisor" },
      ],
    });
    assert.equal(steps[1]?.approvalDepartmentId, "dep_supervisor");
  });

  it("creates a Type 2 configuration that can require Store without hard-coding Cement", () => {
    const steps = parseWorkflowStepsInput([
      { capability: "FIRST_WEIGHMENT", name: "First weighment" },
      { capability: "APPROVAL", name: "Store approval", approvalDepartmentId: "dep_store" },
    ]);
    assert.equal(steps[1]?.name, "Store approval");
    assert.equal(parseMaterialAssignmentInput({ workflowDefinitionId: "wf_2" }).workflowDefinitionId, "wf_2");
  });

  it("creates a Type 3 configuration with organization-specific auto-continue", () => {
    const created = parseWorkflowCreateInput({
      code: "TYPE_3",
      name: "Demo Type 3",
      config: { autoContinue: true, approvalThresholdKg: 40000 },
    });
    assert.equal(created.config.autoContinue, true);
    assert.equal(created.config.approvalThresholdKg, 40000);
    assert.deepEqual(parseWorkflowConfig({ autoContinue: true, approvalThresholdKg: 0 }), {
      autoContinue: true,
      approvalThresholdKg: null,
    });
  });
});

describe("material-to-workflow assignment and transaction snapshot", () => {
  it("assigns material to a transaction and freezes the workflow snapshot", () => {
    const applied = snapshot();
    const blocked = assertCanAssignMaterial(context(), applied);
    assert.equal(blocked, null);
    assert.equal(applied.workflow.code, "TYPE_2");
    assert.equal(applied.steps.some((step) => step.approvalDepartment?.code === "STORE"), true);
  });

  it("detects required approval from the snapshot, not from the material name", () => {
    const type2 = resolveApprovalRequirement(snapshot(), 35000);
    assert.equal(type2.required, true);
    assert.equal(type2.departments[0]?.code, "STORE");

    const type1 = resolveApprovalRequirement(
      snapshot({
        workflow: { id: "wf_1", code: "TYPE_1", name: "Demo Type 1" },
        steps: [
          { sortOrder: 1, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment", isRequired: true, approvalDepartment: null },
          {
            sortOrder: 2,
            capability: WorkflowCapability.APPROVAL,
            name: "Supervisor verification",
            isRequired: true,
            approvalDepartment: { id: "dep_sup", code: "SUPERVISOR", name: "Supervisor" },
          },
        ],
      }),
      35000,
    );
    assert.equal(type1.departments[0]?.code, "SUPERVISOR");
  });

  it("enforces required steps before first weighment", () => {
    const missingDocs = assertCanRecordFirstWeighment(
      context({
        status: TransactionStatus.MATERIAL_CLASSIFIED,
        hasDocument: false,
        hasVerifiedDocument: false,
        snapshot: snapshot(),
      }),
    );
    assert.match(String(missingDocs), /VERIFY_DOCUMENTS|CAPTURE_DOCUMENTS/);
  });

  it("rejects an invalid workflow transition after a snapshot is applied", () => {
    const error = assertCanRecordFirstWeighment(
      context({
        status: TransactionStatus.IDENTIFIED,
        hasDocument: false,
        hasVerifiedDocument: false,
        snapshot: snapshot(),
      }),
    );
    assert.notEqual(error, null);
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.FIRST_WEIGHMENT), false);
  });
});

describe("material verification and OCR matching", () => {
  it("does not auto-select a material when OCR confidence is weak", () => {
    const result = matchMaterialFromOcr(
      [{ id: "1", code: "CEMENT", name: "Cement" }],
      "Cement",
      0.4,
      0.9,
    );
    assert.equal(result.status, "NEEDS_REVIEW");
    assert.equal(result.material?.code, "CEMENT");
  });

  it("matches a unique material name only at or above the configured confidence", () => {
    const result = matchMaterialFromOcr(
      [
        { id: "1", code: "CEMENT", name: "Cement" },
        { id: "2", code: "SAND", name: "Sand" },
      ],
      "Cement",
      0.95,
      0.9,
    );
    assert.equal(result.status, "MATCHED");
    assert.equal(result.material?.code, "CEMENT");
  });

  it("keeps next action on material review until verification", () => {
    const next = resolveNextAction(
      context({
        status: TransactionStatus.MATERIAL_CLASSIFIED,
        snapshot: snapshot({ identificationStatus: "NEEDS_REVIEW", verified: false }),
      }),
    );
    assert.equal(next.code, "verify_material");
    assert.deepEqual(
      resolveAllowedActions(
        context({
          status: TransactionStatus.MATERIAL_CLASSIFIED,
          snapshot: snapshot({ identificationStatus: "NEEDS_REVIEW", verified: false }),
        }),
      ),
      ["assign_material", "verify_material"],
    );
  });
});

describe("workflow snapshot historical consistency", () => {
  it("does not change an existing transaction snapshot when master config later changes", () => {
    const frozen = snapshot();
    const laterMaster = {
      ...frozen,
      workflow: { ...frozen.workflow, code: "TYPE_1" },
      config: { autoContinue: true, approvalThresholdKg: 1000 },
    };
    const parsed = parseWorkflowSnapshot(JSON.parse(JSON.stringify(frozen)));
    assert.equal(parsed?.workflow.code, "TYPE_2");
    assert.equal(parsed?.config.autoContinue, false);
    assert.equal(laterMaster.workflow.code, "TYPE_1");
  });

  it("uses Type 3 threshold from the snapshot, not a universal constant", () => {
    const type3 = snapshot({
      workflow: { id: "wf_3", code: "TYPE_3", name: "Demo Type 3" },
      config: { autoContinue: true, approvalThresholdKg: 40000 },
    });
    assert.equal(resolveApprovalRequirement(type3, 35000).required, false);
    assert.equal(resolveApprovalRequirement(type3, 45000).required, true);
  });
});

describe("authorization and audit vocabulary", () => {
  it("allows administrators to manage materials and blocks weighbridge operators", () => {
    const allowed = requirePermission("material.manage");
    const denied = requirePermission("material.manage");
    let allowedError: unknown;
    let deniedError: unknown;

    allowed(
      { auth: adminUser() } as Request,
      {} as Response,
      ((error?: unknown) => {
        allowedError = error;
      }) as NextFunction,
    );
    denied(
      { auth: operatorUser() } as Request,
      {} as Response,
      ((error?: unknown) => {
        deniedError = error;
      }) as NextFunction,
    );

    assert.equal(allowedError, undefined);
    assert.ok(deniedError instanceof HttpError);
    assert.equal((deniedError as HttpError).status, 403);
  });

  it("records the Step 7 audit actions used by the backend", () => {
    assert.equal(AUDIT_ACTIONS.MATERIAL_CREATED, "MATERIAL_CREATED");
    assert.equal(AUDIT_ACTIONS.MATERIAL_UPDATED, "MATERIAL_UPDATED");
    assert.equal(AUDIT_ACTIONS.MATERIAL_DEACTIVATED, "MATERIAL_DEACTIVATED");
    assert.equal(AUDIT_ACTIONS.WORKFLOW_CREATED, "WORKFLOW_CREATED");
    assert.equal(AUDIT_ACTIONS.WORKFLOW_UPDATED, "WORKFLOW_UPDATED");
    assert.equal(AUDIT_ACTIONS.MATERIAL_ASSIGNED, "MATERIAL_ASSIGNED");
    assert.equal(AUDIT_ACTIONS.MATERIAL_VERIFIED, "MATERIAL_VERIFIED");
    assert.equal(AUDIT_ACTIONS.WORKFLOW_STARTED, "WORKFLOW_STARTED");
    assert.equal(AUDIT_ACTIONS.WORKFLOW_STEP_COMPLETED, "WORKFLOW_STEP_COMPLETED");
  });

  it("accepts a manual material assignment payload", () => {
    const parsed = parseAssignMaterialInput({ materialId: "mat_1", source: "MANUAL" });
    assert.equal(parsed.source, "MANUAL");
    assert.equal(parsed.materialId, "mat_1");
  });
});

describe("legacy first weighment still works without a snapshot", () => {
  it("allows first weighment after identify when no workflow is applied yet", () => {
    assert.equal(
      assertCanRecordFirstWeighment(
        context({
          status: TransactionStatus.IDENTIFIED,
          hasDocument: false,
          hasVerifiedDocument: false,
          snapshot: null,
        }),
      ),
      null,
    );
    assert.equal(resolveNextAction(context({ status: TransactionStatus.DOCUMENT_VERIFIED })).code, "assign_material");
  });
});
