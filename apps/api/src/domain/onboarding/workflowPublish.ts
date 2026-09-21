export type PublishableWorkflowStep = {
  capability: string;
  isRequired: boolean;
  name: string;
  approvalDepartmentId?: string | null | undefined;
};

export type PublishableWorkflow = {
  name: string;
  code: string;
  isActive: boolean;
  steps: PublishableWorkflowStep[];
};

export function workflowPublishErrors(workflow: PublishableWorkflow): string[] {
  const errors: string[] = [];
  if (workflow.steps.length === 0) {
    errors.push(`Workflow ${workflow.name} has no steps.`);
  }
  if (!workflow.steps.some((step) => step.capability === "IDENTIFY_VEHICLE")) {
    errors.push(`Workflow ${workflow.name} must include vehicle identification.`);
  }
  if (!workflow.steps.some((step) => step.capability === "COMPLETE")) {
    errors.push(`Workflow ${workflow.name} must include a completion step.`);
  }
  for (const [index, step] of workflow.steps.entries()) {
    if (step.capability === "APPROVAL" && step.isRequired && !step.approvalDepartmentId) {
      errors.push(`Workflow ${workflow.name} step ${index + 1} requires an approval department.`);
    }
    if (step.name.trim() === "") {
      errors.push(`Workflow ${workflow.name} step ${index + 1} needs a name.`);
    }
  }
  return errors;
}

export function canPublishWorkflow(workflow: PublishableWorkflow): boolean {
  return workflowPublishErrors(workflow).length === 0;
}
