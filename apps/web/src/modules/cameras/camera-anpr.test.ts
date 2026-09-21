import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confidenceLabel, sourceBadge } from "./api.ts";

describe("ANPR display labels", () => {
  it("keeps simulated and manual sources distinct from hardware ANPR", () => {
    assert.equal(sourceBadge("ANPR", true), "SIMULATED");
    assert.equal(sourceBadge("ANPR", false), "ANPR");
    assert.equal(sourceBadge("MANUAL", false), "MANUAL");
    assert.equal(confidenceLabel(0.94), "94%");
    assert.equal(confidenceLabel(null), "—");
  });
});
