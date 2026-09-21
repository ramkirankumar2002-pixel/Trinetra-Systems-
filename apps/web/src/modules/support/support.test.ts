import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canShowInternalNote, emptyDashboard } from "./api.ts";

describe("support display helpers", () => {
  it("hides internal notes from customers", () => {
    assert.equal(canShowInternalNote({ visibility: "INTERNAL" }, false), false);
    assert.equal(canShowInternalNote({ visibility: "INTERNAL" }, true), true);
    assert.equal(canShowInternalNote({ visibility: "CUSTOMER" }, false), true);
  });

  it("starts dashboards at zero rather than inventing counts", () => {
    const empty = emptyDashboard();
    assert.equal(empty.kpis.openTickets, 0);
    assert.equal(empty.activeMaintenance.length, 0);
    assert.equal(empty.unresolvedHighPriority.length, 0);
  });
});
