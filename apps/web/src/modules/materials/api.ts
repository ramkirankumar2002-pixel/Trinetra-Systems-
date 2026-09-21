import { apiRequest } from "../../shared/api/client.ts";

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

export type MaterialListResponse = {
  items: PublicMaterial[];
  page: number;
  pageSize: number;
  total: number;
};

export type MaterialWritePayload = {
  code: string;
  name: string;
  description?: string;
  unitOfMeasure: string;
  isActive?: boolean;
};

export function listMaterialUnits(): Promise<{ units: Array<{ code: string; label: string }> }> {
  return apiRequest<{ units: Array<{ code: string; label: string }> }>("/api/v1/material-units");
}

export function listMaterials(search: URLSearchParams): Promise<MaterialListResponse> {
  return apiRequest<MaterialListResponse>(`/api/v1/materials?${search.toString()}`);
}

export function getMaterial(id: string): Promise<{ material: PublicMaterial }> {
  return apiRequest<{ material: PublicMaterial }>(`/api/v1/materials/${id}`);
}

export function createMaterial(payload: MaterialWritePayload): Promise<{ material: PublicMaterial }> {
  return apiRequest<{ material: PublicMaterial }>("/api/v1/materials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMaterial(id: string, payload: Partial<MaterialWritePayload>): Promise<{ material: PublicMaterial }> {
  return apiRequest<{ material: PublicMaterial }>(`/api/v1/materials/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function setMaterialActive(id: string, isActive: boolean): Promise<{ material: PublicMaterial }> {
  return apiRequest<{ material: PublicMaterial }>(`/api/v1/materials/${id}/${isActive ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

export function assignMaterialWorkflow(
  id: string,
  workflowDefinitionId: string,
): Promise<{ material: PublicMaterial }> {
  return apiRequest<{ material: PublicMaterial }>(`/api/v1/materials/${id}/workflow`, {
    method: "PUT",
    body: JSON.stringify({ workflowDefinitionId }),
  });
}
