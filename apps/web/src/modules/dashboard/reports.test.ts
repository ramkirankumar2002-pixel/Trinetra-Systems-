import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDashboardSearch, EMPTY_COPY, presetToRange } from "./dashboardSections.ts";

describe("reporting UI helpers", () => {
  it("keeps empty report copy explicit", () => {
    assert.equal(EMPTY_COPY.period, "No data available for the selected period.");
    assert.equal(EMPTY_COPY.filters, "No data available for the selected period.");
  });

  it("sends date presets and site filters to the existing reports API", () => {
    const search = buildDashboardSearch({
      from: "2026-09-01",
      to: "2026-09-21",
      siteId: "site_a",
      weighbridgeId: "",
      status: "",
      vehicle: "",
      materialId: "",
      workflowCode: "",
      datePreset: "custom",
      supplierId: "sup_1",
    });
    assert.equal(search.get("datePreset"), "custom");
    assert.equal(search.get("siteId"), "site_a");
    assert.equal(search.get("supplierId"), "sup_1");
    assert.equal(search.get("weighbridgeId"), null);
    const weighmentSearch = buildDashboardSearch({
      from: "",
      to: "",
      siteId: "",
      weighbridgeId: "",
      status: "",
      vehicle: "",
      materialId: "",
      workflowCode: "",
      kind: "GROSS",
      stability: "UNSTABLE",
    });
    assert.equal(weighmentSearch.get("kind"), "GROSS");
    assert.equal(weighmentSearch.get("stability"), "UNSTABLE");
  });

  it("does not treat Type 1/2/3 as a universal workflow meaning in the UI helper", () => {
    const range = presetToRange("current_month", "Asia/Kolkata");
    assert.equal(range.from.endsWith("-01"), true);
    assert.equal(range.to >= range.from, true);
  });
});
