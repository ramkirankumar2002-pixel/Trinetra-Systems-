import { apiRequest } from "../../shared/api/client.ts";
import type { PublicWeightAnomaly } from "../anomalies/api.ts";
import type { PublicOperationalAlert } from "../notifications/api.ts";

export type DashboardCapabilities = {
  view: "management" | "weighbridge" | "store" | "site" | "operations";
  kpis: boolean;
  live: boolean;
  recent: boolean;
  pendingApprovals: boolean;
  pendingUnloading: boolean;
  exceptions: boolean;
  alerts: boolean;
  weightAnomalies: boolean;
  charts: boolean;
  reports: boolean;
  audit: boolean;
  reliability: boolean;
};

export type PublicDashboardTransaction = {
  id: string;
  referenceNumber: string;
  status: string;
  workflowCode: string | null;
  workflowName: string | null;
  vehicleNumber: string | null;
  material: { id: string; code: string; name: string } | null;
  supplier: { id: string; name: string; code: string | null } | null;
  site: { id: string; code: string; name: string };
  weighbridge: { id: string; code: string; name: string } | null;
  responsibleStage: string;
  nextActionCode: string;
  grossWeightKg: string | null;
  tareWeightKg: string | null;
  netWeightKg: string | null;
  unloadingPoint: { id: string; code: string; name: string } | null;
  unloadingStatus: string | null;
  assignedAt: string | null;
  approvalStatus: string | null;
  arrivedAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  durationLabel: string;
  exceptionReason: string | null;
};

export type PublicDashboardException = PublicDashboardTransaction & {
  exceptionType: string;
  message: string;
};

export type PublicDashboardApproval = {
  id: string;
  stepName: string;
  approvalType: string;
  status: string;
  requestedAt: string;
  requestedBy: { id: string; fullName: string } | null;
  department: { id: string; code: string; name: string };
  canOpenApproval: boolean;
  transaction: PublicDashboardTransaction;
};

export type PublicAuditItem = {
  id: string;
  user: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  result: string;
};

export type DashboardKpis = {
  totalTransactions: number;
  todayTransactions: number;
  activeTransactions: number;
  completedTransactions: number;
  pendingApprovals: number;
  pendingUnloading: number;
  exceptions: number;
  totalMaterialWeightKg: string;
  todayDate: string;
  timezone: string;
  totalMaterialWeightScope: "completed_net";
  identifiedToday: number;
  manualIdentificationsToday: number;
  anprFailuresToday: number;
  unregisteredVehiclesToday: number;
};

export type DashboardPayload = {
  capabilities: DashboardCapabilities;
  kpis: DashboardKpis;
  live: PublicDashboardTransaction[];
  recent: PublicDashboardTransaction[];
  pendingApprovals: PublicDashboardApproval[];
  pendingUnloading: PublicDashboardTransaction[];
  exceptions: PublicDashboardException[];
  alerts: PublicOperationalAlert[];
  weightAnomalies: {
    open: number;
    today: number;
    critical: number;
    repeated: number;
    recovered: number;
    items: PublicWeightAnomaly[];
  };
  audit: PublicAuditItem[];
  empty: {
    live: boolean;
    recent: boolean;
    pendingApprovals: boolean;
    pendingUnloading: boolean;
    exceptions: boolean;
    alerts: boolean;
    weightAnomalies: boolean;
    audit: boolean;
    kpis: boolean;
  };
};

export type ChartSeries = { label: string; value: number };

export type ChartPayload = {
  byStatus: ChartSeries[];
  byMaterial: ChartSeries[];
  dailyVolume: ChartSeries[];
  netWeightByMaterial: ChartSeries[];
  netWeightByDay: ChartSeries[];
  bySite: ChartSeries[];
  exceptionCount: ChartSeries[];
  approvalStatus: ChartSeries[];
  gatewayStatus: ChartSeries[];
};

export type DashboardLookups = {
  sites: Array<{ id: string; code: string; name: string }>;
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string }>;
  materials: Array<{ id: string; code: string; name: string }>;
  workflows: Array<{ id: string; code: string; name: string }>;
  suppliers?: Array<{ id: string; name: string; code: string | null }>;
  statuses: string[];
  datePresets?: string[];
  exceptionFamilies?: string[];
  weighmentSources?: string[];
  timezone?: string;
};

export type ReportMeta = {
  empty: boolean;
  emptyMessage: string | null;
  timezone: string;
  from: string | null;
  to: string | null;
  datePreset: string;
  netWeightSource: "transaction.netWeightKg";
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  meta?: ReportMeta;
};

export type MaterialReportRow = {
  materialId: string | null;
  material: string;
  transactionCount: number;
  totalGrossWeightKg: string;
  totalTareWeightKg: string;
  totalNetWeightKg: string;
  workflowClassification?: string;
  configuredWorkflow?: string;
  site?: string;
};

export type VehicleReportRow = {
  vehicleId: string | null;
  vehicleNumber: string;
  transactionCount: number;
  totalNetWeightKg: string;
  totalMaterialHandledKg?: string;
  firstTransactionAt?: string | null;
  lastTransactionAt?: string | null;
  lastTransaction?: { id: string; referenceNumber: string; arrivedAt: string; status: string } | null;
};

export type ExceptionReportRow = {
  exceptionType: string;
  count: number;
  status: string;
  lastDate: string | null;
};

export type ExceptionDetailRow = {
  exceptionType: string;
  detailType?: string;
  transactionId: string | null;
  transaction: string | null;
  site: string;
  weighbridge: string | null;
  createdAt: string;
  status: string;
  resolutionTime: string;
  resolutionStatus: string;
  message?: string;
};

export type WeighmentReportRow = {
  id: string;
  transactionId: string;
  transaction: string;
  vehicleNumber: string | null;
  weighbridge: { id: string; code: string; name: string } | null;
  kind: string;
  weightKg: string;
  unit: string;
  stability: string;
  source: string;
  recordedAt: string;
};

export type SupplierReportRow = {
  supplierId: string | null;
  supplier: string;
  transactionCount: number;
  totalNetWeightKg: string;
  materials: string[];
  from: string | null;
  to: string | null;
};

export type DurationCell = {
  milliseconds: number | null;
  label: string;
  data: "actual" | "insufficient";
  sampleCount?: number;
};

export type WeighbridgeReportRow = {
  weighbridgeId: string | null;
  weighbridge: string;
  isActive: boolean;
  transactionsProcessed: number;
  completedTransactions: number;
  exceptions: number;
  weightAnomalies: number;
  averageTransactionDuration: DurationCell;
  averageWeighmentDuration: DurationCell;
  offlineGatewaySnapshots: number;
  deviceCommunicationFailures: number;
};

export type WorkflowReportRow = {
  stage: string;
  sampleCount: number;
  averageDurationMs: number | null;
  averageDuration: string;
  data: "actual" | "insufficient";
};

export type ApprovalAnalytics = {
  pending: number;
  approved: number;
  rejected: number;
  averageApprovalTime: DurationCell;
  byDepartment: Array<{ department: string; count: number }>;
  byWorkflowStep: Array<{ workflowStep: string; count: number }>;
  meta: ReportMeta;
};

export type AnomalyReportRow = {
  id: string;
  label: string;
  caveat: string;
  type: string;
  transactionId: string | null;
  transaction: string | null;
  deviceId: string | null;
  weighbridge: string;
  observedWeightKg: string | null;
  previousWeightKg: string | null;
  timestamp: string;
  severity: string;
  status: string;
  resolution: string;
};

export type SyncReportRow = {
  gatewayId: string;
  gateway: string;
  connectivityState: string;
  queued: number;
  eventsGenerated: number;
  eventsSynchronized: number;
  failedEvents: number;
  deadLetterEvents: number;
  lastSuccessfulSyncAt: string | null;
  offlineDuration: DurationCell;
  synchronizationDuration: DurationCell;
};

export type DailyOperationsReport = {
  date: string | null;
  vehiclesProcessed: number | null;
  totalTransactions: number | null;
  completed: number | null;
  pending: number | null;
  exceptions: number | null;
  totalNetWeightKg: string | null;
  approvals: number | null;
  weightAnomalies: number | null;
  offlineEvents: number | null;
  meta: ReportMeta;
};

export function getDashboard(search: URLSearchParams): Promise<{ dashboard: DashboardPayload }> {
  return apiRequest<{ dashboard: DashboardPayload }>(`/api/v1/dashboard?${search.toString()}`);
}

export function getDashboardLookups(): Promise<DashboardLookups> {
  return apiRequest<DashboardLookups>("/api/v1/dashboard/lookups");
}

export function getDashboardCharts(search: URLSearchParams): Promise<{ charts: ChartPayload }> {
  return apiRequest<{ charts: ChartPayload }>(`/api/v1/dashboard/charts?${search.toString()}`);
}

export function getReportLookups(): Promise<DashboardLookups> {
  return apiRequest<DashboardLookups>("/api/v1/reports/lookups");
}

export function getTransactionReport(search: URLSearchParams): Promise<Paginated<PublicDashboardTransaction>> {
  return apiRequest<Paginated<PublicDashboardTransaction>>(`/api/v1/reports/transactions?${search.toString()}`);
}

export function getMaterialReport(search: URLSearchParams): Promise<{ items: MaterialReportRow[]; meta?: ReportMeta }> {
  return apiRequest<{ items: MaterialReportRow[]; meta?: ReportMeta }>(`/api/v1/reports/materials?${search.toString()}`);
}

export function getVehicleReport(search: URLSearchParams): Promise<{ items: VehicleReportRow[]; meta?: ReportMeta }> {
  return apiRequest<{ items: VehicleReportRow[]; meta?: ReportMeta }>(`/api/v1/reports/vehicles?${search.toString()}`);
}

export function getExceptionReport(search: URLSearchParams): Promise<{
  items: ExceptionDetailRow[];
  summary?: ExceptionReportRow[];
  page?: number;
  pageSize?: number;
  total?: number;
  meta?: ReportMeta;
}> {
  return apiRequest(`/api/v1/reports/exceptions?${search.toString()}`);
}

export function getWeighmentReport(search: URLSearchParams): Promise<Paginated<WeighmentReportRow>> {
  return apiRequest(`/api/v1/reports/weighments?${search.toString()}`);
}

export function getSupplierReport(search: URLSearchParams): Promise<{ items: SupplierReportRow[]; meta?: ReportMeta }> {
  return apiRequest(`/api/v1/reports/suppliers?${search.toString()}`);
}

export function getWeighbridgeReport(search: URLSearchParams): Promise<{ items: WeighbridgeReportRow[]; meta?: ReportMeta }> {
  return apiRequest(`/api/v1/reports/weighbridges?${search.toString()}`);
}

export function getWorkflowReport(search: URLSearchParams): Promise<{ items: WorkflowReportRow[]; meta?: ReportMeta }> {
  return apiRequest(`/api/v1/reports/workflow?${search.toString()}`);
}

export function getApprovalReport(search: URLSearchParams): Promise<ApprovalAnalytics> {
  return apiRequest(`/api/v1/reports/approvals?${search.toString()}`);
}

export function getAnomalyReport(search: URLSearchParams): Promise<Paginated<AnomalyReportRow>> {
  return apiRequest(`/api/v1/reports/anomalies?${search.toString()}`);
}

export function getSyncReport(search: URLSearchParams): Promise<{ items: SyncReportRow[]; meta?: ReportMeta }> {
  return apiRequest(`/api/v1/reports/sync?${search.toString()}`);
}

export function getDailyReport(search: URLSearchParams): Promise<DailyOperationsReport> {
  return apiRequest(`/api/v1/reports/daily?${search.toString()}`);
}

export async function downloadReportCsv(reportId: string, search: URLSearchParams): Promise<void> {
  const result = await apiRequest<{ filename: string; csv: string }>(
    `/api/v1/reports/${reportId}/export?${search.toString()}`,
  );
  const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  URL.revokeObjectURL(url);
}
