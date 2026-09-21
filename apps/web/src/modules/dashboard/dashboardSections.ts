import type { DashboardCapabilities } from "./api.ts";

export type DashboardSection =
  | "kpis"
  | "charts"
  | "live"
  | "recent"
  | "pendingApprovals"
  | "pendingUnloading"
  | "exceptions"
  | "alerts"
  | "weightAnomalies"
  | "audit";

export const EMPTY_COPY: Record<DashboardSection | "filters" | "period", string> = {
  kpis: "No transactions found for the current scope",
  charts: "No data available for this period",
  live: "No active transactions",
  recent: "No transactions found for selected filters",
  pendingApprovals: "No pending approvals",
  pendingUnloading: "No pending unloading",
  exceptions: "No exceptions found",
  alerts: "No unresolved operational alerts",
  weightAnomalies: "No weight anomalies found",
  audit: "No recent audit activity",
  filters: "No data available for the selected period.",
  period: "No data available for the selected period.",
};

export function visibleDashboardSections(capabilities: DashboardCapabilities | null): DashboardSection[] {
  if (!capabilities) {
    return [];
  }

  const sections: DashboardSection[] = [];
  if (capabilities.kpis) sections.push("kpis");
  if (capabilities.charts) sections.push("charts");
  if (capabilities.live) sections.push("live");
  if (capabilities.recent) sections.push("recent");
  if (capabilities.pendingApprovals) sections.push("pendingApprovals");
  if (capabilities.pendingUnloading) sections.push("pendingUnloading");
  if (capabilities.exceptions) sections.push("exceptions");
  if (capabilities.alerts) sections.push("alerts");
  if (capabilities.weightAnomalies) sections.push("weightAnomalies");
  if (capabilities.audit) sections.push("audit");
  return sections;
}

export function dashboardViewState(input: {
  loading: boolean;
  error: string | null;
  hasData: boolean;
}): "loading" | "error" | "empty" | "ready" {
  if (input.loading) {
    return "loading";
  }
  if (input.error) {
    return "error";
  }
  if (!input.hasData) {
    return "empty";
  }
  return "ready";
}

export function buildDashboardSearch(filters: {
  from: string;
  to: string;
  siteId: string;
  weighbridgeId: string;
  status: string;
  vehicle: string;
  materialId: string;
  workflowCode: string;
  page?: string;
  pageSize?: string;
  datePreset?: string;
  supplierId?: string;
  exceptionFamily?: string;
  source?: string;
  kind?: string;
  stability?: string;
}): URLSearchParams {
  const search = new URLSearchParams();
  if (filters.from !== "") search.set("from", filters.from);
  if (filters.to !== "") search.set("to", filters.to);
  if (filters.siteId !== "") search.set("siteId", filters.siteId);
  if (filters.weighbridgeId !== "") search.set("weighbridgeId", filters.weighbridgeId);
  if (filters.status !== "") search.set("status", filters.status);
  if (filters.vehicle.trim() !== "") search.set("vehicle", filters.vehicle.trim());
  if (filters.materialId !== "") search.set("materialId", filters.materialId);
  if (filters.workflowCode !== "") search.set("workflowCode", filters.workflowCode);
  if (filters.page) search.set("page", filters.page);
  if (filters.pageSize) search.set("pageSize", filters.pageSize);
  if (filters.datePreset && filters.datePreset !== "") search.set("datePreset", filters.datePreset);
  if (filters.supplierId && filters.supplierId !== "") search.set("supplierId", filters.supplierId);
  if (filters.exceptionFamily && filters.exceptionFamily !== "") search.set("exceptionFamily", filters.exceptionFamily);
  if (filters.source && filters.source !== "") search.set("source", filters.source);
  if (filters.kind && filters.kind !== "") search.set("kind", filters.kind);
  if (filters.stability && filters.stability !== "") search.set("stability", filters.stability);
  return search;
}

export function calendarDateInTimeZone(timeZone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(dateYmd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) {
    return dateYmd;
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = String(shifted.getUTCFullYear());
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function presetToRange(
  preset: string,
  timeZone: string,
): { from: string; to: string } {
  const today = calendarDateInTimeZone(timeZone);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = addCalendarDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "last_7_days":
      return { from: addCalendarDays(today, -6), to: today };
    case "last_30_days":
      return { from: addCalendarDays(today, -29), to: today };
    case "current_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return { from: "", to: "" };
  }
}

export function approvalHref(canOpenApproval: boolean, approvalId: string, transactionId: string): string {
  return canOpenApproval ? `/approvals/${approvalId}` : `/transactions/${transactionId}`;
}
