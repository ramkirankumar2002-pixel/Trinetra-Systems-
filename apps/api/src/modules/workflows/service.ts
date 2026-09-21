import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicWorkflow, workflowInclude } from "./mapper.js";
import type { WorkflowStepInput, WorkflowWriteInput } from "./validators.js";

export async function listWorkflows(actor: ActorContext, query: Record<string, unknown>) {
  const isActive =
    query.isActive === "true" ? true : query.isActive === "false" ? false : undefined;
  const search = typeof query.search === "string" && query.search.trim() !== "" ? query.search.trim() : undefined;

  const records = await prisma.workflowDefinition.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...(isActive === undefined ? {} : { isActive }),
      ...(search === undefined
        ? {}
        : {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { name: { contains: search, mode: "insensitive" } },
            ],
          }),
    },
    include: workflowInclude,
    orderBy: { code: "asc" },
  });

  return { workflows: records.map(toPublicWorkflow) };
}

export async function getWorkflow(actor: ActorContext, workflowId: string) {
  const record = await prisma.workflowDefinition.findFirst({
    where: { id: workflowId, organizationId: actor.user.organizationId },
    include: workflowInclude,
  });
  if (!record) {
    throw new HttpError(404, "Workflow not found");
  }
  return toPublicWorkflow(record);
}

export async function createWorkflow(actor: ActorContext, input: WorkflowWriteInput) {
  try {
    const record = await prisma.workflowDefinition.create({
      data: {
        organizationId: actor.user.organizationId,
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        isActive: input.isActive,
        config: input.config,
      },
      include: workflowInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.WORKFLOW_CREATED,
      entityType: "WorkflowDefinition",
      entityId: record.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: record.code },
    });

    return toPublicWorkflow(record);
  } catch (error) {
    throw uniqueWorkflowError(error);
  }
}

export async function updateWorkflow(
  actor: ActorContext,
  workflowId: string,
  input: Partial<WorkflowWriteInput>,
) {
  const existing = await prisma.workflowDefinition.findFirst({
    where: { id: workflowId, organizationId: actor.user.organizationId },
  });
  if (!existing) {
    throw new HttpError(404, "Workflow not found");
  }

  try {
    const record = await prisma.workflowDefinition.update({
      where: { id: existing.id },
      data: {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.config === undefined ? {} : { config: input.config }),
      },
      include: workflowInclude,
    });

    await writeAudit({
      organizationId: actor.user.organizationId,
      actorUserId: actor.user.id,
      action: AUDIT_ACTIONS.WORKFLOW_UPDATED,
      entityType: "WorkflowDefinition",
      entityId: record.id,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      metadata: { code: record.code },
    });

    return toPublicWorkflow(record);
  } catch (error) {
    throw uniqueWorkflowError(error);
  }
}

export async function replaceWorkflowSteps(
  actor: ActorContext,
  workflowId: string,
  steps: WorkflowStepInput[],
) {
  const existing = await prisma.workflowDefinition.findFirst({
    where: { id: workflowId, organizationId: actor.user.organizationId },
  });
  if (!existing) {
    throw new HttpError(404, "Workflow not found");
  }

  const departmentIds = [
    ...new Set(
      steps
        .map((step) => step.approvalDepartmentId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  if (departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { id: { in: departmentIds }, organizationId: actor.user.organizationId, deletedAt: null },
    });
    if (departments.length !== departmentIds.length) {
      throw new HttpError(400, "One or more approval departments were not found");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.workflowStep.deleteMany({ where: { workflowDefinitionId: existing.id } });
    await tx.workflowStep.createMany({
      data: steps.map((step) => ({
        workflowDefinitionId: existing.id,
        sortOrder: step.sortOrder,
        capability: step.capability,
        name: step.name,
        isRequired: step.isRequired,
        approvalDepartmentId: step.approvalDepartmentId ?? null,
      })),
    });

    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.WORKFLOW_UPDATED,
        entityType: "WorkflowDefinition",
        entityId: existing.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { code: existing.code, stepCount: steps.length },
      },
      tx,
    );
  });

  return getWorkflow(actor, existing.id);
}

function uniqueWorkflowError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new HttpError(409, "A workflow with this code already exists");
  }
  throw error;
}
