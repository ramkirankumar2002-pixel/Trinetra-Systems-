import { UnloadingPointStatus } from "@prisma/client";
import { HttpError } from "../../lib/httpError.js";

export type UnloadingPointWriteInput = {
  siteId: string;
  code: string;
  name: string;
  description?: string | undefined;
  status: UnloadingPointStatus;
  isActive: boolean;
  allowedMaterialIds: string[];
  sortOrder: number;
};

export type AssignmentRuleWriteInput = {
  siteId: string;
  materialId?: string | undefined;
  unloadingPointId: string;
  priority: number;
  isActive: boolean;
};

export function parseUnloadingPointCreateInput(body: unknown): UnloadingPointWriteInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Unloading point details are required");
  }
  const record = body as Record<string, unknown>;
  return {
    siteId: requiredId(record.siteId, "site"),
    code: parseCode(record.code),
    name: parseName(record.name),
    ...(optionalText(record.description, "Description") === undefined
      ? {}
      : { description: optionalText(record.description, "Description") }),
    status: parseStatus(record.status, UnloadingPointStatus.AVAILABLE),
    isActive: record.isActive === undefined ? true : record.isActive === true,
    allowedMaterialIds: parseIdList(record.allowedMaterialIds),
    sortOrder: parseSortOrder(record.sortOrder),
  };
}

export function parseUnloadingPointUpdateInput(body: unknown): Partial<UnloadingPointWriteInput> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Unloading point details are required");
  }
  const record = body as Record<string, unknown>;
  const updates: Partial<UnloadingPointWriteInput> = {};
  if (record.code !== undefined) updates.code = parseCode(record.code);
  if (record.name !== undefined) updates.name = parseName(record.name);
  if (record.description !== undefined) {
    const description = optionalText(record.description, "Description");
    updates.description = description ?? "";
  }
  if (record.status !== undefined) updates.status = parseStatus(record.status, UnloadingPointStatus.AVAILABLE);
  if (record.isActive !== undefined) updates.isActive = record.isActive === true;
  if (record.allowedMaterialIds !== undefined) updates.allowedMaterialIds = parseIdList(record.allowedMaterialIds);
  if (record.sortOrder !== undefined) updates.sortOrder = parseSortOrder(record.sortOrder);
  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, "At least one unloading point field is required");
  }
  return updates;
}

export function parseAssignmentRuleCreateInput(body: unknown): AssignmentRuleWriteInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Assignment rule details are required");
  }
  const record = body as Record<string, unknown>;
  const materialId =
    typeof record.materialId === "string" && record.materialId.trim() !== "" ? record.materialId.trim() : undefined;
  return {
    siteId: requiredId(record.siteId, "site"),
    unloadingPointId: requiredId(record.unloadingPointId, "unloading point"),
    priority: parseSortOrder(record.priority ?? 100),
    isActive: record.isActive === undefined ? true : record.isActive === true,
    ...(materialId === undefined ? {} : { materialId }),
  };
}

function parseCode(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "An unloading point code is required");
  }
  const code = value.trim().toUpperCase().replaceAll(/\s+/g, "-");
  if (code.length < 2 || code.length > 20) {
    throw new HttpError(400, "Unloading point code must be 2–20 characters");
  }
  return code;
}

function parseName(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "An unloading point name is required");
  }
  const name = value.trim();
  if (name.length < 2 || name.length > 80) {
    throw new HttpError(400, "Unloading point name must be 2–80 characters");
  }
  return name;
}

function parseStatus(value: unknown, fallback: UnloadingPointStatus): UnloadingPointStatus {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (typeof value !== "string" || !Object.values(UnloadingPointStatus).includes(value as UnloadingPointStatus)) {
    throw new HttpError(400, "Invalid unloading point status");
  }
  return value as UnloadingPointStatus;
}

function parseSortOrder(value: unknown): number {
  if (value === undefined || value === "") {
    return 0;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 9999) {
    throw new HttpError(400, "Sort order must be a whole number");
  }
  return numeric;
}

function parseIdList(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Allowed materials must be a list of IDs");
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new HttpError(400, "Allowed materials must be a list of IDs");
    }
    return item.trim();
  });
}

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `A ${field} is required`);
  }
  return value.trim();
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
