import type { Prisma } from "@prisma/client";

export const materialInclude = {
  assignments: {
    where: { effectiveTo: null },
    orderBy: [{ siteId: "asc" as const }, { effectiveFrom: "desc" as const }],
    include: {
      workflowDefinition: { select: { id: true, code: true, name: true, isActive: true } },
      site: { select: { id: true, code: true, name: true } },
    },
  },
};

export type MaterialRecord = Prisma.MaterialGetPayload<{ include: typeof materialInclude }>;

export type PublicMaterialAssignment = {
  id: string;
  workflow: { id: string; code: string; name: string; isActive: boolean };
  site: { id: string; code: string; name: string } | null;
  effectiveFrom: string;
};

export type PublicMaterial = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  defaultWorkflow: PublicMaterialAssignment | null;
  assignments: PublicMaterialAssignment[];
};

export function toPublicMaterial(record: MaterialRecord): PublicMaterial {
  const assignments = record.assignments.map((assignment) => ({
    id: assignment.id,
    workflow: assignment.workflowDefinition,
    site: assignment.site,
    effectiveFrom: assignment.effectiveFrom.toISOString(),
  }));
  const defaultWorkflow = assignments.find((assignment) => assignment.site === null) ?? null;

  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    unitOfMeasure: record.unitOfMeasure,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    defaultWorkflow,
    assignments,
  };
}
