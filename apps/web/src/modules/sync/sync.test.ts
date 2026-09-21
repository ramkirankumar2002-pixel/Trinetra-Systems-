import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSyncTime, offlineBannerText } from "./api.ts";

describe("offline synchronization labels", () => {
  it("separates local save messaging from connectivity", () => {
    assert.equal(
      offlineBannerText({ internetStatus: "OFFLINE", backendStatus: "UNREACHABLE", configStale: false }),
      "Internet connection unavailable. Weighbridge operations are being stored locally.",
    );
    assert.equal(
      offlineBannerText({ internetStatus: "ONLINE", backendStatus: "REACHABLE", configStale: true }),
      "Configuration refresh required.",
    );
    assert.equal(
      offlineBannerText({ internetStatus: "ONLINE", backendStatus: "REACHABLE", configStale: false }),
      null,
    );
    assert.equal(formatSyncTime(null), "Never");
    assert.match(formatSyncTime("2026-09-20T10:00:00.000Z", Date.parse("2026-09-20T10:00:08.000Z")), /8 seconds/);
  });
});
