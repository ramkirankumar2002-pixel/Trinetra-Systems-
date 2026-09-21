import type { Prisma } from "@prisma/client";
import { parseWorkflowConfig } from "../../domain/workflowSnapshot.js";

export const workflowInclude = {
  steps: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      approvalDepartment: { select: { id: true, code: true, name: true } },
    },
  },
} as const;

export type WorkflowRecord = Prisma.WorkflowDefinitionGetPayload<{ include: typeof workflowInclude }>;

export type PublicWorkflow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  config: { autoContinue: boolean; approvalThresholdKg: number | null };
  createdAt: string;
  updatedAt: string;
  steps: Array<{
    id: string;
    sortOrder: number;
    capability: string;
    name: string;
    isRequired: boolean;
    approvalDepartment: { id: string; code: string; name: string } | null;
  }>;
};

export function toPublicWorkflow(record: WorkflowRecord): PublicWorkflow {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description,
    isActive: record.isActive,
    config: parseWorkflowConfig(record.config),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    steps: record.steps.map((step) => ({
      id: step.id,
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: step.isRequired,
      approvalDepartment: step.approvalDepartment,
    })),
  };
}
