import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { heartbeatAgeLabel } from "./api.ts";

describe("edge gateway labels", () => {
  it("describes a recent heartbeat without exposing credentials", () => {
    const now = Date.parse("2026-09-20T10:00:10.000Z");
    assert.equal(heartbeatAgeLabel("2026-09-20T10:00:00.000Z", now), "10 seconds ago");
    assert.equal(heartbeatAgeLabel(null, now), "Never");
  });
});
