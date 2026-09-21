import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { organizationKindLabel, siteStatusLabel } from "./api.ts";

describe("tenancy display helpers", () => {
  it("labels demo organizations without implying platform-wide access", () => {
    assert.equal(organizationKindLabel("DEMO"), "Demo organization");
    assert.equal(organizationKindLabel("CUSTOMER"), "Customer organization");
  });

  it("does not treat an inactive site as deleted", () => {
    assert.equal(siteStatusLabel("INACTIVE"), "Inactive");
    assert.equal(siteStatusLabel("ACTIVE"), "Active");
  });
});
