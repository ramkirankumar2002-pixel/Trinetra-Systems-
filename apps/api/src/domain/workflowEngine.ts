import { TransactionStatus, UnloadingStatus, WorkflowCapability } from "@prisma/client";
import {
  parseWorkflowSnapshot,
  requiredApprovalDepartments,
  type WorkflowSnapshot,
} from "./workflowSnapshot.js";

export type TransactionAction =
  | "identify"
  | "upload_document"
  | "assign_material"
  | "verify_material"
  | "record_gross"
  | "assign_unloading"
  | "start_unloading"
  | "complete_unloading"
  | "record_tare"
  | "finalize";

export type NextAction = {
  code: string;
  label: string;
  blocking: boolean;
  approvalId?: string | undefined;
};

export type UnloadingProgressStatus = UnloadingStatus | null;

export type WorkflowProgressContext = {
  status: TransactionStatus;
  hasVehicle: boolean;
  hasGross: boolean;
  hasTare: boolean;
  hasDocument: boolean;
  hasVerifiedDocument: boolean;
  snapshot: WorkflowSnapshot | null;
  grossWeightKg: number | null;
  netWeightKg: string | null;
  tareExceedsGross: boolean;
  hasUnloadingPoint: boolean;
  unloadingStatus: UnloadingProgressStatus;
  isCompleted: boolean;
  approvedStepSortOrders: number[];
  rejectedStepSortOrders: number[];
  pendingApproval: { id: string; sortOrder: number; departmentName: string } | null;
};

export function requiredCapabilitiesBefore(
  snapshot: WorkflowSnapshot,
  capability: WorkflowCapability,
): WorkflowCapability[] {
  const target = snapshot.steps.find((step) => step.capability === capability);
  if (!target) {
    return [];
  }

  return snapshot.steps
    .filter((step) => step.isRequired && step.sortOrder < target.sortOrder)
    .map((step) => step.capability);
}

export function isCapabilitySatisfied(
  capability: WorkflowCapability,
  context: WorkflowProgressContext,
): boolean {
  switch (capability) {
    case WorkflowCapability.IDENTIFY_VEHICLE:
      return context.hasVehicle;
    case WorkflowCapability.CAPTURE_DOCUMENTS:
      return context.hasDocument;
    case WorkflowCapability.VERIFY_DOCUMENTS:
      return context.hasVerifiedDocument;
    case WorkflowCapability.CLASSIFY_MATERIAL:
      return context.snapshot !== null && (context.snapshot.identificationStatus === "MATCHED" || context.snapshot.verified);
    case WorkflowCapability.FIRST_WEIGHMENT:
      return context.hasGross;
    case WorkflowCapability.APPROVAL:
      return remainingApprovalSteps(context.snapshot, context).length === 0;
    case WorkflowCapability.UNLOAD:
      return context.unloadingStatus === UnloadingStatus.COMPLETED;
    case WorkflowCapability.SECOND_WEIGHMENT:
      return context.hasTare && !context.tareExceedsGross;
    case WorkflowCapability.COMPLETE:
      return context.isCompleted;
    default: {
      const exhaustive: never = capability;
      return exhaustive;
    }
  }
}

export function isStepSatisfied(
  step: WorkflowSnapshot["steps"][number],
  context: WorkflowProgressContext,
): boolean {
  if (step.capability === WorkflowCapability.APPROVAL) {
    if (context.approvedStepSortOrders.includes(step.sortOrder)) {
      return true;
    }
    return remainingApprovalSteps(context.snapshot, context).length === 0;
  }
  return isCapabilitySatisfied(step.capability, context);
}

export function unmetRequiredSteps(
  snapshot: WorkflowSnapshot,
  before: WorkflowCapability,
  context: WorkflowProgressContext,
): WorkflowCapability[] {
  const target = snapshot.steps.find((step) => step.capability === before);
  if (!target) {
    return [];
  }

  return snapshot.steps
    .filter((step) => step.isRequired && step.sortOrder < target.sortOrder && !isStepSatisfied(step, context))
    .map((step) => step.capability);
}

export function remainingApprovalSteps(
  snapshot: WorkflowSnapshot | null,
  context: Pick<WorkflowProgressContext, "grossWeightKg" | "approvedStepSortOrders">,
): WorkflowSnapshot["steps"] {
  const requirement = resolveApprovalRequirement(snapshot, context.grossWeightKg);
  if (!snapshot || !requirement.required) {
    return [];
  }

  return snapshot.steps.filter(
    (step) =>
      step.capability === WorkflowCapability.APPROVAL &&
      step.isRequired &&
      step.approvalDepartment !== null &&
      !context.approvedStepSortOrders.includes(step.sortOrder),
  );
}

export function assertCanRecordFirstWeighment(context: WorkflowProgressContext): string | null {
  if (context.hasGross) {
    return "A first weighment has already been recorded";
  }

  if (!context.snapshot) {
    if (
      context.status !== TransactionStatus.IDENTIFIED &&
      context.status !== TransactionStatus.DOCUMENT_VERIFIED
    ) {
      return "First weighment can only be recorded after the vehicle is identified or the document is verified";
    }
    return null;
  }

  const unmet = unmetRequiredSteps(context.snapshot, WorkflowCapability.FIRST_WEIGHMENT, context);
  if (unmet.length > 0) {
    return `First weighment is blocked until required steps are complete: ${unmet.join(", ")}`;
  }

  return null;
}

export function assertCanAssignMaterial(context: WorkflowProgressContext, incoming: WorkflowSnapshot): string | null {
  if (context.hasGross) {
    return "Material cannot be changed after the first weighment";
  }

  if (
    context.status !== TransactionStatus.IDENTIFIED &&
    context.status !== TransactionStatus.DOCUMENT_VERIFIED &&
    context.status !== TransactionStatus.MATERIAL_CLASSIFIED
  ) {
    return "Material can only be assigned after the vehicle is identified";
  }

  const unmet = unmetRequiredSteps(incoming, WorkflowCapability.CLASSIFY_MATERIAL, {
    ...context,
    snapshot: incoming,
  });
  if (unmet.length > 0) {
    return `Material cannot be assigned until required steps are complete: ${unmet.join(", ")}`;
  }

  return null;
}

export function preUnloadingBlockers(context: WorkflowProgressContext): string | null {
  if (context.rejectedStepSortOrders.length > 0 || context.status === TransactionStatus.REJECTED) {
    return "Approval was rejected. This transaction cannot proceed to unloading.";
  }

  if (context.status === TransactionStatus.EXCEPTION) {
    return "This transaction is in exception review and cannot proceed";
  }

  if (context.status === TransactionStatus.ON_HOLD) {
    return "This transaction is on hold";
  }

  if (!context.hasVehicle) {
    return "A vehicle must be identified before unloading";
  }

  if (!context.snapshot) {
    return "Material and workflow must be identified before unloading";
  }

  if (context.snapshot.identificationStatus === "NEEDS_REVIEW" && !context.snapshot.verified) {
    return "Material identification must be verified before unloading";
  }

  const unmet = unmetRequiredSteps(context.snapshot, WorkflowCapability.UNLOAD, context);
  if (unmet.includes(WorkflowCapability.VERIFY_DOCUMENTS) || unmet.includes(WorkflowCapability.CAPTURE_DOCUMENTS)) {
    return "Required document verification is incomplete";
  }
  if (unmet.includes(WorkflowCapability.CLASSIFY_MATERIAL)) {
    return "Material must be identified before unloading";
  }
  if (unmet.includes(WorkflowCapability.FIRST_WEIGHMENT) || !context.hasGross) {
    return "First weighment is required before unloading";
  }
  if (unmet.includes(WorkflowCapability.APPROVAL) || remainingApprovalSteps(context.snapshot, context).length > 0) {
    return "Required approval is incomplete";
  }
  if (unmet.length > 0) {
    return `Unloading is blocked until required steps are complete: ${unmet.join(", ")}`;
  }

  if (
    context.status !== TransactionStatus.APPROVED &&
    context.status !== TransactionStatus.FIRST_WEIGHMENT &&
    context.status !== TransactionStatus.UNLOADING
  ) {
    return "This transaction is not ready for unloading";
  }

  return null;
}

export function assertCanAssignUnloading(context: WorkflowProgressContext): string | null {
  const blocked = preUnloadingBlockers(context);
  if (blocked) {
    return blocked;
  }

  if (context.unloadingStatus === UnloadingStatus.IN_PROGRESS || context.unloadingStatus === UnloadingStatus.COMPLETED) {
    return "Unloading has already started and the point cannot be changed";
  }

  if (context.status !== TransactionStatus.APPROVED && context.status !== TransactionStatus.FIRST_WEIGHMENT) {
    return "An unloading point can only be assigned after required approvals";
  }

  return null;
}

export function assertCanStartUnloading(context: WorkflowProgressContext): string | null {
  const blocked = preUnloadingBlockers(context);
  if (blocked) {
    return blocked;
  }

  if (!context.hasUnloadingPoint) {
    return "An unloading point must be assigned first";
  }

  if (context.unloadingStatus === UnloadingStatus.IN_PROGRESS) {
    return "Unloading has already started";
  }

  if (context.unloadingStatus === UnloadingStatus.COMPLETED) {
    return "Unloading has already been completed";
  }

  if (context.status !== TransactionStatus.APPROVED && context.status !== TransactionStatus.FIRST_WEIGHMENT) {
    return "Unloading can only start after required approvals";
  }

  return null;
}

export function assertCanCompleteUnloading(context: WorkflowProgressContext): string | null {
  if (context.status !== TransactionStatus.UNLOADING) {
    return "Unloading can only be completed while it is in progress";
  }

  if (context.unloadingStatus !== UnloadingStatus.IN_PROGRESS) {
    return "Unloading has not been started";
  }

  if (!context.hasUnloadingPoint) {
    return "An unloading point is required";
  }

  return null;
}

export function assertCanRecordSecondWeighment(context: WorkflowProgressContext): string | null {
  if (context.hasTare) {
    return "A second weighment has already been recorded";
  }

  if (context.status !== TransactionStatus.UNLOADED) {
    return "Second weighment can only be recorded after unloading is completed";
  }

  if (context.unloadingStatus !== UnloadingStatus.COMPLETED) {
    return "Unloading must be completed before the second weighment";
  }

  if (!context.hasGross) {
    return "A first weighment is required before the second weighment";
  }

  if (!context.hasVehicle) {
    return "A vehicle is required before the second weighment";
  }

  return null;
}

export function assertCanFinalize(context: WorkflowProgressContext): string | null {
  if (context.isCompleted || context.status === TransactionStatus.COMPLETED) {
    return "This transaction is already completed";
  }

  if (context.status === TransactionStatus.EXCEPTION || context.tareExceedsGross) {
    return "This transaction has a weight exception and needs review before completion";
  }

  if (context.rejectedStepSortOrders.length > 0 || context.status === TransactionStatus.REJECTED) {
    return "Required approval was rejected";
  }

  if (!context.hasVehicle) {
    return "A vehicle is required before completion";
  }

  if (!context.snapshot) {
    return "Material and workflow must be identified before completion";
  }

  if (context.snapshot.identificationStatus === "NEEDS_REVIEW" && !context.snapshot.verified) {
    return "Material identification must be verified before completion";
  }

  const unmet = unmetRequiredSteps(context.snapshot, WorkflowCapability.COMPLETE, context);
  if (unmet.includes(WorkflowCapability.VERIFY_DOCUMENTS) || unmet.includes(WorkflowCapability.CAPTURE_DOCUMENTS)) {
    return "Required document verification is incomplete";
  }
  if (unmet.includes(WorkflowCapability.APPROVAL) || remainingApprovalSteps(context.snapshot, context).length > 0) {
    return "Required approval is incomplete";
  }
  if (unmet.includes(WorkflowCapability.UNLOAD) || context.unloadingStatus !== UnloadingStatus.COMPLETED) {
    return "Unloading must be completed before finalization";
  }
  if (!context.hasGross) {
    return "A valid first weighment is required";
  }
  if (!context.hasTare) {
    return "A valid second weighment is required";
  }
  if (context.netWeightKg === null) {
    return "Net weight has not been calculated";
  }
  if (unmet.length > 0) {
    return `Transaction cannot be completed until required steps are finished: ${unmet.join(", ")}`;
  }

  if (context.status !== TransactionStatus.SECOND_WEIGHMENT) {
    return "This transaction is not ready for finalization";
  }

  return null;
}

export function resolveApprovalRequirement(
  snapshot: WorkflowSnapshot | null,
  grossWeightKg: number | null,
): { required: boolean; departments: ReturnType<typeof requiredApprovalDepartments>; reason: string } {
  if (!snapshot) {
    return { required: false, departments: [], reason: "No workflow has been applied yet" };
  }

  const departments = requiredApprovalDepartments(snapshot);
  if (departments.length === 0) {
    return { required: false, departments: [], reason: "This workflow has no required approval step" };
  }

  const threshold = snapshot.config.approvalThresholdKg;
  if (snapshot.config.autoContinue && threshold !== null && grossWeightKg !== null && grossWeightKg < threshold) {
    return {
      required: false,
      departments,
      reason: `Automatic continuation is configured below ${threshold} KG`,
    };
  }

  return {
    required: true,
    departments,
    reason: departments.map((department) => department.name).join(", "),
  };
}

export function resolveNextAction(context: WorkflowProgressContext): NextAction {
  if (context.isCompleted || context.status === TransactionStatus.COMPLETED) {
    return { code: "completed", label: "Transaction completed", blocking: false };
  }

  if (context.status === TransactionStatus.ARRIVED || !context.hasVehicle) {
    return { code: "identify", label: "Identify vehicle", blocking: true };
  }

  if (context.snapshot) {
    if (context.snapshot.identificationStatus === "NEEDS_REVIEW" && !context.snapshot.verified) {
      return { code: "verify_material", label: "Material needs review", blocking: true };
    }

    const weighUnmet = unmetRequiredSteps(context.snapshot, WorkflowCapability.FIRST_WEIGHMENT, context);
    if (!context.hasGross && weighUnmet.length > 0) {
      if (weighUnmet.includes(WorkflowCapability.IDENTIFY_VEHICLE)) {
        return { code: "identify", label: "Identify vehicle", blocking: true };
      }
      if (
        weighUnmet.includes(WorkflowCapability.VERIFY_DOCUMENTS) ||
        weighUnmet.includes(WorkflowCapability.CAPTURE_DOCUMENTS)
      ) {
        return {
          code: "upload_document",
          label: weighUnmet.includes(WorkflowCapability.VERIFY_DOCUMENTS)
            ? "Document verification required"
            : "Upload required document",
          blocking: true,
        };
      }
      if (weighUnmet.includes(WorkflowCapability.CLASSIFY_MATERIAL)) {
        return { code: "assign_material", label: "Identify material and apply workflow", blocking: true };
      }
    }

    if (!context.hasGross) {
      return { code: "record_gross", label: "Record first weighment", blocking: true };
    }

    if (context.rejectedStepSortOrders.length > 0 || context.status === TransactionStatus.REJECTED) {
      return { code: "blocked", label: "Approval rejected — transaction cannot continue", blocking: true };
    }

    const remaining = remainingApprovalSteps(context.snapshot, context);
    if (remaining.length > 0) {
      const next = remaining[0];
      const name = next?.approvalDepartment?.name ?? "Required";
      if (context.pendingApproval) {
        return {
          code: "await_approval",
          label: `${context.pendingApproval.departmentName} approval required`,
          blocking: true,
          approvalId: context.pendingApproval.id,
        };
      }
      return { code: "await_approval", label: `${name} approval required`, blocking: true };
    }

    if (context.status === TransactionStatus.EXCEPTION || context.tareExceedsGross) {
      return { code: "review_exception", label: "Weight exception needs review", blocking: true };
    }

    if (!context.hasUnloadingPoint) {
      return { code: "assign_unloading", label: "Assign unloading point", blocking: true };
    }

    if (context.unloadingStatus !== UnloadingStatus.IN_PROGRESS && context.unloadingStatus !== UnloadingStatus.COMPLETED) {
      return { code: "start_unloading", label: "Ready for unloading", blocking: true };
    }

    if (context.unloadingStatus === UnloadingStatus.IN_PROGRESS) {
      return { code: "complete_unloading", label: "Mark as unloaded", blocking: true };
    }

    if (!context.hasTare) {
      return { code: "record_tare", label: "Record second weighment", blocking: true };
    }

    return { code: "finalize", label: "Finalize transaction", blocking: true };
  }

  if (context.status === TransactionStatus.IDENTIFIED && !context.hasDocument) {
    return { code: "upload_document", label: "Upload document or record first weighment", blocking: false };
  }

  if (context.status === TransactionStatus.DOCUMENT_PENDING) {
    return { code: "upload_document", label: "Complete document verification", blocking: true };
  }

  if (context.status === TransactionStatus.DOCUMENT_VERIFIED && !context.hasGross) {
    return { code: "assign_material", label: "Identify material and apply workflow", blocking: true };
  }

  if (!context.hasGross) {
    return { code: "record_gross", label: "Record first weighment", blocking: true };
  }

  return { code: "continue", label: "No further Step 7 action", blocking: false };
}

export function resolveAllowedActions(context: WorkflowProgressContext): TransactionAction[] {
  const actions: TransactionAction[] = [];

  if (context.status === TransactionStatus.ARRIVED) {
    actions.push("identify");
    return actions;
  }

  if (context.isCompleted || context.status === TransactionStatus.COMPLETED) {
    return actions;
  }

  if (
    (context.status === TransactionStatus.IDENTIFIED || context.status === TransactionStatus.DOCUMENT_PENDING) &&
    !context.hasGross
  ) {
    actions.push("upload_document");
  }

  if (
    (context.status === TransactionStatus.IDENTIFIED ||
      context.status === TransactionStatus.DOCUMENT_VERIFIED ||
      context.status === TransactionStatus.MATERIAL_CLASSIFIED) &&
    !context.hasGross
  ) {
    actions.push("assign_material");
  }

  if (
    context.snapshot?.identificationStatus === "NEEDS_REVIEW" &&
    !context.snapshot.verified &&
    context.status === TransactionStatus.MATERIAL_CLASSIFIED
  ) {
    actions.push("verify_material");
  }

  if (assertCanRecordFirstWeighment(context) === null) {
    actions.push("record_gross");
  }

  if (assertCanAssignUnloading(context) === null) {
    actions.push("assign_unloading");
  }

  if (assertCanStartUnloading(context) === null) {
    actions.push("start_unloading");
  }

  if (assertCanCompleteUnloading(context) === null) {
    actions.push("complete_unloading");
  }

  if (assertCanRecordSecondWeighment(context) === null) {
    actions.push("record_tare");
  }

  if (assertCanFinalize(context) === null) {
    actions.push("finalize");
  }

  return actions;
}

export function readSnapshot(value: unknown): WorkflowSnapshot | null {
  return parseWorkflowSnapshot(value);
}
