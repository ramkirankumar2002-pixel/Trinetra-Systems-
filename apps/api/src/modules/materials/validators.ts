import { env } from "../../config/env.js";
import { normalizeMaterialCode, normalizeMaterialName, validateMaterialCode } from "../../domain/materialCode.js";
import { isAllowedMaterialUnit, normalizeMaterialUnit } from "../../domain/materialUnits.js";
import { HttpError } from "../../lib/httpError.js";

export type MaterialWriteInput = {
  code: string;
  name: string;
  description?: string | undefined;
  unitOfMeasure: string;
  isActive: boolean;
};

export type MaterialAssignmentInput = {
  workflowDefinitionId: string;
  siteId?: string | undefined;
};

export function parseMaterialCreateInput(body: unknown): MaterialWriteInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Material details are required");
  }

  const record = body as Record<string, unknown>;
  const description = optionalText(record.description, "Description");
  return {
    code: parseCode(record.code),
    name: parseName(record.name),
    ...(description === undefined ? {} : { description }),
    unitOfMeasure: parseUnit(record.unitOfMeasure ?? "MT"),
    isActive: record.isActive === undefined ? true : record.isActive === true,
  };
}

export function parseMaterialUpdateInput(body: unknown): Partial<MaterialWriteInput> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Material details are required");
  }

  const record = body as Record<string, unknown>;
  const updates: Partial<MaterialWriteInput> = {};

  if (record.code !== undefined) {
    updates.code = parseCode(record.code);
  }
  if (record.name !== undefined) {
    updates.name = parseName(record.name);
  }
  if (record.description !== undefined) {
    updates.description = typeof record.description === "string" ? record.description.trim() : "";
    if (typeof record.description !== "string") {
      throw new HttpError(400, "Description must be text");
    }
  }
  if (record.unitOfMeasure !== undefined) {
    updates.unitOfMeasure = parseUnit(record.unitOfMeasure);
  }
  if (record.isActive !== undefined) {
    updates.isActive = record.isActive === true;
  }

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "At least one material field is required");
  }

  return updates;
}

export function parseMaterialAssignmentInput(body: unknown): MaterialAssignmentInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "A workflow is required");
  }

  const record = body as Record<string, unknown>;
  if (typeof record.workflowDefinitionId !== "string" || record.workflowDefinitionId.trim() === "") {
    throw new HttpError(400, "A workflow is required");
  }

  const siteId =
    typeof record.siteId === "string" && record.siteId.trim() !== "" ? record.siteId.trim() : undefined;

  return siteId === undefined
    ? { workflowDefinitionId: record.workflowDefinitionId.trim() }
    : { workflowDefinitionId: record.workflowDefinitionId.trim(), siteId };
}

function parseCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "A material code is required");
  }
  const code = normalizeMaterialCode(value);
  const error = validateMaterialCode(code);
  if (error) {
    throw new HttpError(400, error);
  }
  return code;
}

function parseName(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "A material name is required");
  }
  const name = normalizeMaterialName(value);
  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, "Material name must be 2–80 characters");
  }
  return name;
}

function parseUnit(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "A unit of measure is required");
  }
  const unit = normalizeMaterialUnit(value);
  if (!isAllowedMaterialUnit(unit, env.materialUnits)) {
    throw new HttpError(400, "This unit of measure is not configured");
  }
  return unit;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be text`);
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
