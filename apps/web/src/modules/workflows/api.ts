import { apiRequest } from "../../shared/api/client.ts";

export type WorkflowConfig = {
  autoContinue: boolean;
  approvalThresholdKg: number | null;
};

export type PublicWorkflowStep = {
  id: string;
  sortOrder: number;
  capability: string;
  name: string;
  isRequired: boolean;
  approvalDepartment: { id: string; code: string; name: string } | null;
};

export type PublicWorkflow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  config: WorkflowConfig;
  createdAt: string;
  updatedAt: string;
  steps: PublicWorkflowStep[];
};

export type WorkflowWritePayload = {
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  config: WorkflowConfig;
};

export type WorkflowStepWrite = {
  sortOrder: number;
  capability: string;
  name: string;
  isRequired: boolean;
  approvalDepartmentId?: string;
};

export function listWorkflowCapabilities(): Promise<{ capabilities: Array<{ code: string; label: string }> }> {
  return apiRequest<{ capabilities: Array<{ code: string; label: string }> }>("/api/v1/workflow-capabilities");
}

export function listDepartments(): Promise<{ departments: Array<{ id: string; code: string; name: string }> }> {
  return apiRequest<{ departments: Array<{ id: string; code: string; name: string }> }>("/api/v1/departments");
}

export function listWorkflows(search: URLSearchParams = new URLSearchParams()): Promise<{ workflows: PublicWorkflow[] }> {
  return apiRequest<{ workflows: PublicWorkflow[] }>(`/api/v1/workflows?${search.toString()}`);
}

export function getWorkflow(id: string): Promise<{ workflow: PublicWorkflow }> {
  return apiRequest<{ workflow: PublicWorkflow }>(`/api/v1/workflows/${id}`);
}

export function createWorkflow(payload: WorkflowWritePayload): Promise<{ workflow: PublicWorkflow }> {
  return apiRequest<{ workflow: PublicWorkflow }>("/api/v1/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkflow(id: string, payload: Partial<WorkflowWritePayload>): Promise<{ workflow: PublicWorkflow }> {
  return apiRequest<{ workflow: PublicWorkflow }>(`/api/v1/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function replaceWorkflowSteps(id: string, steps: WorkflowStepWrite[]): Promise<{ workflow: PublicWorkflow }> {
  return apiRequest<{ workflow: PublicWorkflow }>(`/api/v1/workflows/${id}/steps`, {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
}
