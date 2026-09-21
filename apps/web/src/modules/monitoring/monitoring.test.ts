import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasPermission } from "../../shared/auth/permissions.ts";
import type { PublicUser } from "../../shared/auth/types.ts";
import { formatApiError } from "../../shared/api/errors.ts";
import { notificationHref } from "../notifications/notificationHref.ts";
import { monitoringPollMs, serviceLabel } from "./api.ts";
import { friendlyDriverErrorKey } from "../driver/workflow.ts";

function user(permissions: string[]): PublicUser {
  return {
    id: "user_1",
    fullName: "Tester",
    email: "tester@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: null,
    defaultSite: null,
    roles: [],
    permissions,
  };
}

describe("monitoring access", () => {
  it("hides the monitoring dashboard from drivers and operators", () => {
    assert.equal(hasPermission(user(["driver.mode", "weighment.record", "weighbridge.read"]), "monitoring.read"), false);
    assert.equal(hasPermission(user(["monitoring.read"]), "monitoring.read"), true);
  });

  it("routes system degraded alerts to monitoring", () => {
    assert.equal(
      notificationHref({ type: "SYSTEM_DEGRADED", approvalId: null, transactionId: null, href: "" }),
      "/monitoring",
    );
    assert.equal(serviceLabel("postgresql"), "Database");
    assert.equal(serviceLabel("anpr"), "ANPR");
  });

  it("keeps monitoring refresh between 30 and 60 seconds by default", () => {
    assert.equal(monitoringPollMs(undefined), 45_000);
    assert.equal(monitoringPollMs("15000"), 45_000);
    assert.equal(monitoringPollMs("30000"), 30_000);
    assert.equal(monitoringPollMs("60000"), 60_000);
  });

  it("shows a reference ID to staff and a simple message to drivers", () => {
    assert.equal(
      formatApiError(
        { status: 500, message: "Something went wrong. Please contact the administrator.", referenceId: "REQ-ABCD1234" },
        "failed",
      ),
      "Something went wrong. Please contact the administrator. Reference ID: REQ-ABCD1234",
    );
    assert.equal(
      friendlyDriverErrorKey({ status: 500, message: "Something went wrong. Please contact the administrator." }),
      "genericError",
    );
  });
});
