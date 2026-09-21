import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasPermission } from "../../shared/auth/permissions.ts";
import type { PublicUser } from "../../shared/auth/types.ts";
import { notificationHref } from "../notifications/notificationHref.ts";
import { dependencyLabel } from "./api.ts";

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

describe("reliability visibility", () => {
  it("hides infrastructure status from drivers and operators", () => {
    assert.equal(hasPermission(user(["driver.mode", "weighment.record"]), "reliability.read"), false);
    assert.equal(hasPermission(user(["reliability.read"]), "reliability.read"), true);
  });

  it("routes recovery notifications to the reliability or sync pages", () => {
    assert.equal(
      notificationHref({ type: "BACKUP_FAILED", approvalId: null, transactionId: null, href: "" }),
      "/reliability",
    );
    assert.equal(
      notificationHref({ type: "GATEWAY_OFFLINE", approvalId: null, transactionId: null, href: "" }),
      "/weighbridge/sync",
    );
    assert.equal(dependencyLabel("postgresql"), "Database");
    assert.equal(dependencyLabel("offlineSync"), "Synchronization");
  });
});
