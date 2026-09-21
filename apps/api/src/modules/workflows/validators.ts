import { WorkflowCapability } from "@prisma/client";
import { normalizeMaterialCode } from "../../domain/materialCode.js";
import { parseWorkflowConfig } from "../../domain/workflowSnapshot.js";
import { HttpError } from "../../lib/httpError.js";

export type WorkflowWriteInput = {
  code: string;
  name: string;
  description?: string | undefined;
  isActive: boolean;
  config: {
    autoContinue: boolean;
    approvalThresholdKg: number | null;
  };
};

export type WorkflowStepInput = {
  sortOrder: number;
  capability: WorkflowCapability;
  name: string;
  isRequired: boolean;
  approvalDepartmentId?: string | undefined;
};

export function parseWorkflowCreateInput(body: unknown): WorkflowWriteInput {
  const parsed = parseWorkflowWriteInput(body, false);
  if (parsed.code === undefined || parsed.name === undefined || parsed.isActive === undefined || parsed.config === undefined) {
    throw new HttpError(400, "Workflow details are required");
  }

  return {
    code: parsed.code,
    name: parsed.name,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    isActive: parsed.isActive,
    config: parsed.config,
  };
}

export function parseWorkflowWriteInput(body: unknown, partial: boolean): Partial<WorkflowWriteInput> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Workflow details are required");
  }

  const record = body as Record<string, unknown>;
  const updates: Partial<WorkflowWriteInput> = {};

  if (!partial || record.code !== undefined) {
    if (typeof record.code !== "string" || record.code.trim() === "") {
      throw new HttpError(400, "A workflow code is required");
    }
    updates.code = normalizeMaterialCode(record.code);
  }

  if (!partial || record.name !== undefined) {
    if (typeof record.name !== "string" || record.name.trim() === "") {
      throw new HttpError(400, "A workflow name is required");
    }
    updates.name = record.name.trim();
  }

  if (record.description !== undefined) {
    if (typeof record.description !== "string") {
      throw new HttpError(400, "Description must be text");
    }
    updates.description = record.description.trim();
  }

  if (!partial || record.isActive !== undefined) {
    updates.isActive = record.isActive === undefined ? true : record.isActive === true;
  }

  if (!partial || record.config !== undefined) {
    updates.config = parseWorkflowConfig(record.config);
  }

  if (partial && Object.keys(updates).length === 0) {
    throw new HttpError(400, "At least one workflow field is required");
  }

  return updates;
}

export function parseWorkflowStepsInput(body: unknown): WorkflowStepInput[] {
  const source =
    typeof body === "object" && body !== null && "steps" in body
      ? (body as { steps: unknown }).steps
      : body;

  if (!Array.isArray(source) || source.length === 0) {
    throw new HttpError(400, "At least one workflow step is required");
  }

  return source.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new HttpError(400, "Each workflow step must be an object");
    }
    const record = item as Record<string, unknown>;
    if (typeof record.capability !== "string" || !isCapability(record.capability)) {
      throw new HttpError(400, `Step ${index + 1} has an invalid capability`);
    }
    if (typeof record.name !== "string" || record.name.trim() === "") {
      throw new HttpError(400, `Step ${index + 1} needs a name`);
    }
    if (record.capability === WorkflowCapability.APPROVAL && typeof record.approvalDepartmentId !== "string") {
      throw new HttpError(400, `Step ${index + 1} requires an approval department`);
    }

    const approvalDepartmentId =
      typeof record.approvalDepartmentId === "string" && record.approvalDepartmentId !== ""
        ? record.approvalDepartmentId
        : undefined;

    return {
      sortOrder: typeof record.sortOrder === "number" ? record.sortOrder : index + 1,
      capability: record.capability,
      name: record.name.trim(),
      isRequired: record.isRequired !== false,
      ...(approvalDepartmentId === undefined ? {} : { approvalDepartmentId }),
    };
  });
}

export function listWorkflowCapabilities(): Array<{ code: WorkflowCapability; label: string }> {
  return (Object.values(WorkflowCapability) as WorkflowCapability[]).map((code) => ({
    code,
    label: code.replaceAll("_", " "),
  }));
}

function isCapability(value: string): value is WorkflowCapability {
  return (Object.values(WorkflowCapability) as string[]).includes(value);
}
