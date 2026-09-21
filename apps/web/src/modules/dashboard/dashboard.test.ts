import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approvalHref,
  addCalendarDays,
  buildDashboardSearch,
  calendarDateInTimeZone,
  dashboardViewState,
  EMPTY_COPY,
  presetToRange,
  visibleDashboardSections,
} from "./dashboardSections.ts";
import type { DashboardCapabilities } from "./api.ts";

const management: DashboardCapabilities = {
  view: "management",
  kpis: true,
  live: true,
  recent: true,
  pendingApprovals: true,
  pendingUnloading: true,
  exceptions: true,
  alerts: true,
  weightAnomalies: true,
  charts: true,
  reports: true,
  audit: true,
  reliability: true,
};

const weighbridge: DashboardCapabilities = {
  ...management,
  view: "weighbridge",
  pendingApprovals: false,
  charts: false,
  reports: false,
  audit: false,
  reliability: false,
};

describe("dashboard rendering helpers", () => {
  it("shows loading, error, empty, and ready states", () => {
    assert.equal(dashboardViewState({ loading: true, error: null, hasData: false }), "loading");
    assert.equal(dashboardViewState({ loading: false, error: "Unable to load dashboard", hasData: false }), "error");
    assert.equal(dashboardViewState({ loading: false, error: null, hasData: false }), "empty");
    assert.equal(dashboardViewState({ loading: false, error: null, hasData: true }), "ready");
  });

  it("keeps empty-state copy explicit instead of implying zero activity", () => {
    assert.equal(EMPTY_COPY.live, "No active transactions");
    assert.equal(EMPTY_COPY.pendingApprovals, "No pending approvals");
    assert.equal(EMPTY_COPY.exceptions, "No exceptions found");
    assert.equal(EMPTY_COPY.filters, "No data available for the selected period.");
    assert.equal(EMPTY_COPY.period, "No data available for the selected period.");
  });

  it("hides management-only sections for weighbridge users", () => {
    assert.deepEqual(visibleDashboardSections(management), [
      "kpis",
      "charts",
      "live",
      "recent",
      "pendingApprovals",
      "pendingUnloading",
      "exceptions",
      "alerts",
      "weightAnomalies",
      "audit",
    ]);
    assert.equal(visibleDashboardSections(weighbridge).includes("charts"), false);
    assert.equal(visibleDashboardSections(weighbridge).includes("pendingApprovals"), false);
    assert.equal(visibleDashboardSections(weighbridge).includes("live"), true);
  });
});

describe("dashboard filters and navigation", () => {
  it("omits blank filters so typing does not send empty query keys", () => {
    const search = buildDashboardSearch({
      from: "2026-09-01",
      to: "",
      siteId: "",
      weighbridgeId: "",
      status: "APPROVED",
      vehicle: "  AP39XX1234  ",
      materialId: "",
      workflowCode: "TYPE_2",
      page: "2",
      pageSize: "20",
    });
    assert.equal(search.get("from"), "2026-09-01");
    assert.equal(search.get("to"), null);
    assert.equal(search.get("status"), "APPROVED");
    assert.equal(search.get("vehicle"), "AP39XX1234");
    assert.equal(search.get("workflowCode"), "TYPE_2");
    assert.equal(search.get("page"), "2");
  });

  it("maps date presets to site-calendar ranges without using UTC midnight", () => {
    const today = calendarDateInTimeZone("Asia/Kolkata");
    assert.equal(today.length, 10);
    const week = presetToRange("last_7_days", "Asia/Kolkata");
    assert.equal(week.to, today);
    assert.equal(addCalendarDays(week.from, 6), week.to);
  });

  it("opens the existing approval page only when the user can decide", () => {
    assert.equal(approvalHref(true, "apr_1", "txn_1"), "/approvals/apr_1");
    assert.equal(approvalHref(false, "apr_1", "txn_1"), "/transactions/txn_1");
  });
});
