import { apiRequest } from "../../shared/api/client.ts";

export type PublicApproval = {
  id: string;
  status: string;
  stepName: string;
  capability: string;
  snapshotStepSortOrder: number;
  requestedRoleCode: string | null;
  requestedAt: string;
  decidedAt: string | null;
  comments: string | null;
  department: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  assignedUser: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  canDecide: boolean;
  transaction: {
    id: string;
    referenceNumber: string;
    status: string;
    arrivedAt: string;
    vehicleNumber: string | null;
    transporterName: string | null;
    material: { id: string; code: string; name: string } | null;
    supplier: { id: string; name: string; code: string | null } | null;
    workflowCode: string | null;
    workflowName: string | null;
    grossWeightKg: string | null;
    documents: Array<{
      id: string;
      documentType: string;
      documentTypeLabel: string;
      status: string;
      originalFileName: string;
      invoiceNumber: string | null;
      supplierName: string | null;
      materialName: string | null;
    }>;
  };
};

export type ApprovalListResponse = {
  items: PublicApproval[];
  page: number;
  pageSize: number;
  total: number;
  pendingCount: number;
};

export function listApprovals(search: URLSearchParams): Promise<ApprovalListResponse> {
  return apiRequest<ApprovalListResponse>(`/api/v1/approvals?${search.toString()}`);
}

export function getApproval(id: string): Promise<{ approval: PublicApproval }> {
  return apiRequest<{ approval: PublicApproval }>(`/api/v1/approvals/${id}`);
}

export function approveApproval(id: string, comments?: string): Promise<{ approval: PublicApproval }> {
  return apiRequest<{ approval: PublicApproval }>(`/api/v1/approvals/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(comments ? { comments } : {}),
  });
}

export function rejectApproval(id: string, reason: string): Promise<{ approval: PublicApproval }> {
  return apiRequest<{ approval: PublicApproval }>(`/api/v1/approvals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
