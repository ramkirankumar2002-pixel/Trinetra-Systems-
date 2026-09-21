import { apiRequest } from "../../shared/api/client.ts";

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

export function listUnloadingPoints(search = new URLSearchParams()): Promise<{ items: PublicUnloadingPoint[] }> {
  return apiRequest<{ items: PublicUnloadingPoint[] }>(`/api/v1/unloading-points?${search.toString()}`);
}

export function createUnloadingPoint(payload: {
  siteId: string;
  code: string;
  name: string;
  description?: string;
  status?: string;
}): Promise<{ unloadingPoint: PublicUnloadingPoint }> {
  return apiRequest<{ unloadingPoint: PublicUnloadingPoint }>("/api/v1/unloading-points", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUnloadingPoint(
  id: string,
  payload: Partial<{ name: string; status: string; isActive: boolean }>,
): Promise<{ unloadingPoint: PublicUnloadingPoint }> {
  return apiRequest<{ unloadingPoint: PublicUnloadingPoint }>(`/api/v1/unloading-points/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listAssignmentRules(): Promise<{ items: PublicAssignmentRule[] }> {
  return apiRequest<{ items: PublicAssignmentRule[] }>("/api/v1/unloading-point-rules");
}

export function createAssignmentRule(payload: {
  siteId: string;
  unloadingPointId: string;
  materialId?: string;
  priority: number;
}): Promise<{ rule: PublicAssignmentRule }> {
  return apiRequest<{ rule: PublicAssignmentRule }>("/api/v1/unloading-point-rules", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listSites(): Promise<{ items: Array<{ id: string; code: string; name: string }> }> {
  return apiRequest<{ items: Array<{ id: string; code: string; name: string }> }>("/api/v1/sites");
}
