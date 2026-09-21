import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { containsSecret, findingTone } from "./api.ts";

describe("onboarding display helpers", () => {
  it("maps validation severity without exposing secrets", () => {
    assert.equal(findingTone("PASS"), "pass");
    assert.equal(findingTone("WARNING"), "warning");
    assert.equal(findingTone("ERROR"), "error");
    assert.equal(containsSecret("Primary weighbridge configured."), false);
    assert.equal(containsSecret("temporary password issued"), true);
    assert.equal(containsSecret("tgw_live_credential"), true);
  });
});
