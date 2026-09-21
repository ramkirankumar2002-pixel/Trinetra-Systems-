import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anomalyTypeLabel } from "./api.ts";
import { visibleDashboardSections, EMPTY_COPY } from "../dashboard/dashboardSections.ts";
import type { DashboardCapabilities } from "../dashboard/api.ts";

const capabilities: DashboardCapabilities = {
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

describe("weight anomaly UI helpers", () => {
  it("shows a weight anomalies dashboard section with explicit empty copy", () => {
    assert.equal(visibleDashboardSections(capabilities).includes("weightAnomalies"), true);
    assert.equal(EMPTY_COPY.weightAnomalies, "No weight anomalies found");
    assert.equal(anomalyTypeLabel("EMPTY_PLATFORM_WEIGHT"), "EMPTY PLATFORM WEIGHT");
  });
});
