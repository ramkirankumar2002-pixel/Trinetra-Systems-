import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sourceLabel } from "./api.ts";

describe("weighbridge hardware labels", () => {
  it("keeps simulated values from looking like hardware", () => {
    assert.equal(sourceLabel("HARDWARE"), "HARDWARE");
    assert.equal(sourceLabel("SIMULATOR"), "SIMULATED");
    assert.equal(sourceLabel("SIMULATED"), "SIMULATED");
    assert.equal(sourceLabel("MANUAL"), "MANUAL");
  });
});
