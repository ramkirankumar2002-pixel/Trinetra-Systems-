import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyOverview, secretWarning } from "./api.ts";

describe("integration display helpers", () => {
  it("starts overview counts at zero", () => {
    const empty = emptyOverview();
    assert.equal(empty.kpis.activeIntegrations, 0);
    assert.equal(empty.kpis.failedDeliveries, 0);
    assert.equal(empty.recentActivity.length, 0);
  });

  it("warns that secrets are shown only once", () => {
    assert.equal(secretWarning("tsk_test_example"), "Store this secret securely. It will not be shown again.");
    assert.equal(secretWarning(null), "");
  });
});
