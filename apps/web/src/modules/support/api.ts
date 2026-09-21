import { apiRequest } from "../../shared/api/client.ts";

export type NamedRef = { id: string; code: string; name: string };
export type UserRef = { id: string; fullName: string; email?: string };

export type PublicTicketSummary = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  site: NamedRef;
  assignedUser: UserRef | null;
  weighbridge: NamedRef | null;
  device: { id: string; code: string; name: string } | null;
};

export type PublicTicketActivity = {
  id: string;
  type: string;
  visibility: string;
  description: string;
  createdAt: string;
  actor: UserRef;
};

export type PublicSupportTicket = PublicTicketSummary & {
  description: string;
  assignedTeam: string | null;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  allowedTransitions: string[];
  canManage: boolean;
  canComment: boolean;
  canSeeInternal: boolean;
  createdBy: UserRef;
  resolvedBy: UserRef | null;
  closedBy: UserRef | null;
  gateway: NamedRef | null;
  transaction: { id: string; referenceNumber: string; status: string } | null;
  activities: PublicTicketActivity[];
  maintenanceRecords: Array<{
    id: string;
    recordNumber: string;
    type: string;
    status: string;
    reason: string;
    createdAt: string;
    completedAt: string | null;
  }>;
};

export type PublicMaintenance = {
  id: string;
  recordNumber: string;
  type: string;
  status: string;
  reason: string;
  description: string;
  findings: string | null;
  actionTaken: string | null;
  partsReplaced: string | null;
  beforeCondition: string | null;
  afterCondition: string | null;
  startedAt: string | null;
  endedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  site: NamedRef;
  performedBy: UserRef | null;
  weighbridge: NamedRef | null;
  gateway: NamedRef | null;
  device: { id: string; code: string; name: string; status: string; installationStatus: string } | null;
  ticket: { id: string; ticketNumber: string; subject: string; status: string } | null;
  maintenanceWindow: {
    id: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    reason: string;
  } | null;
};

export type SupportDashboard = {
  kpis: {
    openTickets: number;
    criticalTickets: number;
    awaitingResponse: number;
    inProgress: number;
    resolvedTickets: number;
    activeMaintenance: number;
  };
  activeMaintenance: PublicMaintenance[];
  recentlyCompletedMaintenance: PublicMaintenance[];
  devicesWithRecentIssues: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    openTickets: number;
  }>;
  unresolvedHighPriority: PublicTicketSummary[];
};

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number };

export type SupportCatalog = {
  categories: string[];
  priorities: string[];
  ticketStatuses: string[];
  maintenanceTypes: string[];
  maintenanceStatuses: string[];
};

export function getSupportCatalog(): Promise<SupportCatalog> {
  return apiRequest("/api/v1/support/catalog");
}

export function getSupportDashboard(search: URLSearchParams): Promise<SupportDashboard> {
  return apiRequest(`/api/v1/support/dashboard?${search.toString()}`);
}

export function listTickets(search: URLSearchParams): Promise<Paged<PublicTicketSummary>> {
  return apiRequest(`/api/v1/support/tickets?${search.toString()}`);
}

export function getTicket(id: string): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}`);
}

export function createTicket(payload: Record<string, unknown>): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest("/api/v1/support/tickets", { method: "POST", body: JSON.stringify(payload) });
}

export function assignTicket(id: string, payload: { assignedUserId?: string | null; assignedTeam?: string | null }): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}/assign`, { method: "POST", body: JSON.stringify(payload) });
}

export function changeTicketPriority(id: string, priority: string): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}/priority`, { method: "POST", body: JSON.stringify({ priority }) });
}

export function changeTicketStatus(id: string, payload: { status: string; expectedStatus?: string; resolutionSummary?: string }): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}/status`, { method: "POST", body: JSON.stringify(payload) });
}

export function closeTicket(id: string): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}/close`, { method: "POST", body: JSON.stringify({}) });
}

export function addTicketComment(id: string, payload: { body: string; internal?: boolean }): Promise<{ ticket: PublicSupportTicket }> {
  return apiRequest(`/api/v1/support/tickets/${id}/comments`, { method: "POST", body: JSON.stringify(payload) });
}

export function listAssignees(): Promise<{ items: UserRef[] }> {
  return apiRequest("/api/v1/support/assignees");
}

export function listMaintenance(search: URLSearchParams): Promise<Paged<PublicMaintenance>> {
  return apiRequest(`/api/v1/support/maintenance?${search.toString()}`);
}

export function getMaintenance(id: string): Promise<{ maintenance: PublicMaintenance }> {
  return apiRequest(`/api/v1/support/maintenance/${id}`);
}

export function createMaintenance(payload: Record<string, unknown>): Promise<{ maintenance: PublicMaintenance }> {
  return apiRequest("/api/v1/support/maintenance", { method: "POST", body: JSON.stringify(payload) });
}

export function startMaintenanceRecord(id: string): Promise<{ maintenance: PublicMaintenance }> {
  return apiRequest(`/api/v1/support/maintenance/${id}/start`, { method: "POST", body: JSON.stringify({}) });
}

export function completeMaintenanceRecord(id: string, payload: Record<string, unknown>): Promise<{ maintenance: PublicMaintenance }> {
  return apiRequest(`/api/v1/support/maintenance/${id}/complete`, { method: "POST", body: JSON.stringify(payload) });
}

export function cancelMaintenanceRecord(id: string): Promise<{ maintenance: PublicMaintenance }> {
  return apiRequest(`/api/v1/support/maintenance/${id}/cancel`, { method: "POST", body: JSON.stringify({}) });
}

export function getDeviceHistory(id: string): Promise<Record<string, unknown>> {
  return apiRequest(`/api/v1/support/devices/${id}/history`);
}

export function getWeighbridgeHistory(id: string): Promise<Record<string, unknown>> {
  return apiRequest(`/api/v1/support/weighbridges/${id}/history`);
}

export function canShowInternalNote(activity: Pick<PublicTicketActivity, "visibility">, canSeeInternal: boolean): boolean {
  return activity.visibility !== "INTERNAL" || canSeeInternal;
}

export function emptyDashboard(): SupportDashboard {
  return {
    kpis: {
      openTickets: 0,
      criticalTickets: 0,
      awaitingResponse: 0,
      inProgress: 0,
      resolvedTickets: 0,
      activeMaintenance: 0,
    },
    activeMaintenance: [],
    recentlyCompletedMaintenance: [],
    devicesWithRecentIssues: [],
    unresolvedHighPriority: [],
  };
}
