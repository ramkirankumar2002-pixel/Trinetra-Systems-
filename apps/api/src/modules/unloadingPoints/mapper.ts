import type { Prisma } from "@prisma/client";

export const unloadingPointInclude = {
  site: { select: { id: true, code: true, name: true } },
} as const;

export const assignmentRuleInclude = {
  site: { select: { id: true, code: true, name: true } },
  material: { select: { id: true, code: true, name: true } },
  unloadingPoint: { select: { id: true, code: true, name: true, status: true } },
} as const;

export type UnloadingPointRecord = Prisma.UnloadingPointGetPayload<{ include: typeof unloadingPointInclude }>;
export type AssignmentRuleRecord = Prisma.UnloadingPointAssignmentRuleGetPayload<{
  include: typeof assignmentRuleInclude;
}>;

export type PublicUnloadingPoint = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  isActive: boolean;
  allowedMaterialIds: string[];
  sortOrder: number;
  site: { id: string; code: string; name: string };
};

export type PublicAssignmentRule = {
  id: string;
  priority: number;
  isActive: boolean;
  site: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string } | null;
  unloadingPoint: { id: string; code: string; name: string; status: string };
};

export function toPublicUnloadingPoint(record: UnloadingPointRecord): PublicUnloadingPoint {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    status: record.status,
    isActive: record.isActive,
    allowedMaterialIds: record.allowedMaterialIds,
    sortOrder: record.sortOrder,
    site: record.site,
  };
}

export function toPublicAssignmentRule(record: AssignmentRuleRecord): PublicAssignmentRule {
  return {
    id: record.id,
    priority: record.priority,
    isActive: record.isActive,
    site: record.site,
    material: record.material,
    unloadingPoint: record.unloadingPoint,
  };
}
