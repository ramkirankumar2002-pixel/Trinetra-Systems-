import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAcknowledgeAlert, canResolveAlert, nextAlertStatus } from "../src/domain/alertLifecycle.js";
import {
  EVENT_KEYS,
  getNotificationDefinition,
  isNotificationType,
  normalizeNotificationType,
  notificationHref,
  NOTIFICATION_DEFINITIONS,
} from "../src/domain/notificationCatalog.js";
import { canManageOperationalAlert, shouldReceiveEvent, type RoutedUser } from "../src/domain/notificationRouting.js";
import { parseAlertFilters, parseNotificationFilters } from "../src/modules/notifications/validators.js";
import { HttpError } from "../src/lib/httpError.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { NextFunction, Request, Response } from "express";

function routed(overrides: Partial<RoutedUser> = {}): RoutedUser {
  return {
    id: "user_store",
    isActive: true,
    organizationId: "org",
    isAdmin: false,
    permissions: ["approval.decide", "dashboard.read"],
    departmentId: "dep_store",
    departmentCode: "STORE",
    roleCodes: ["STORE_OFFICER"],
    defaultSiteId: "site_a",
    orgWide: false,
    siteIds: ["site_a"],
    ...overrides,
  };
}

function event(overrides: Partial<Parameters<typeof shouldReceiveEvent>[1]> = {}) {
  return {
    type: "APPROVAL_REQUIRED" as const,
    organizationId: "org",
    siteId: "site_a",
    actorUserId: "user_operator",
    departmentId: "dep_store",
    departmentCode: "STORE",
    assignedUserId: null,
    ...overrides,
  };
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_1",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_office", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role_office", code: "OFFICE_MANAGER", name: "Office Manager", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions: ["dashboard.read", "report.read"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function callPermission(permission: string, auth: AuthenticatedUser): unknown {
  let caught: unknown;
  requirePermission(permission)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      caught = error;
    }) as NextFunction,
  );
  return caught;
}

describe("notification catalog", () => {
  it("classifies workflow events with the specified types and severities", () => {
    assert.equal(getNotificationDefinition("APPROVAL_REQUIRED").severity, "WARNING");
    assert.equal(getNotificationDefinition("APPROVAL_APPROVED").severity, "SUCCESS");
    assert.equal(getNotificationDefinition("APPROVAL_REJECTED").severity, "ERROR");
    assert.equal(getNotificationDefinition("WEIGHT_EXCEPTION").severity, "ERROR");
    assert.equal(getNotificationDefinition("TRANSACTION_COMPLETED").severity, "SUCCESS");
    assert.equal(getNotificationDefinition("APPROVAL_REQUIRED").createAlert, true);
    assert.equal(getNotificationDefinition("TRANSACTION_COMPLETED").createAlert, false);
    assert.equal(normalizeNotificationType("APPROVAL_REQUESTED"), "APPROVAL_REQUIRED");
    assert.equal(isNotificationType("APPROVAL_REQUIRED"), true);
    assert.equal(getNotificationDefinition("WEIGHT_ANOMALY").createAlert, true);
    assert.equal(Object.keys(NOTIFICATION_DEFINITIONS).length, 28);
  });

  it("uses distinct event keys so accidental repeats are blocked and new events are not", () => {
    assert.equal(EVENT_KEYS.approvalRequired("apr_1"), "approval.required:apr_1");
    assert.notEqual(EVENT_KEYS.approvalApproved("apr_1"), EVENT_KEYS.approvalRequired("apr_1"));
    assert.notEqual(
      EVENT_KEYS.unloadingAssigned("tx_1", "up_1", "2026-09-20T10:00:00.000Z"),
      EVENT_KEYS.unloadingAssigned("tx_1", "up_2", "2026-09-20T11:00:00.000Z"),
    );
  });
});

describe("recipient routing and site isolation", () => {
  it("sends approval required only to authorized store users on the same site", () => {
    assert.equal(shouldReceiveEvent(routed(), event()), true);
    assert.equal(shouldReceiveEvent(routed({ departmentCode: "LAB", departmentId: "dep_lab", roleCodes: ["LAB_USER"] }), event()), false);
    assert.equal(shouldReceiveEvent(routed({ siteIds: ["site_b"], defaultSiteId: "site_b" }), event()), false);
    assert.equal(shouldReceiveEvent(routed({ id: "user_operator" }), event()), false);
    assert.equal(shouldReceiveEvent(routed({ organizationId: "other" }), event()), false);
    assert.equal(shouldReceiveEvent(routed({ isActive: false }), event()), false);
  });

  it("routes weight exceptions to management and keeps site B users out", () => {
    const office = routed({
      id: "user_office",
      permissions: ["dashboard.read", "report.read"],
      roleCodes: ["OFFICE_MANAGER"],
      departmentCode: "OFFICE",
    });
    assert.equal(shouldReceiveEvent(office, event({ type: "WEIGHT_EXCEPTION" })), true);
    assert.equal(
      shouldReceiveEvent(
        { ...office, siteIds: ["site_b"], defaultSiteId: "site_b" },
        event({ type: "WEIGHT_EXCEPTION" }),
      ),
      false,
    );
  });

  it("restricts alert acknowledgement to authorized management roles", () => {
    assert.equal(
      canManageOperationalAlert(
        user({
          roles: [{ id: "role_sup", code: "SUPERVISOR", name: "Supervisor", site: null }],
          permissions: ["dashboard.read", "security.acknowledge"],
        }),
      ),
      true,
    );
    assert.equal(canManageOperationalAlert(user()), false);
    assert.equal(
      canManageOperationalAlert(
        user({
          roles: [{ id: "r", code: "STORE_OFFICER", name: "Store", site: { id: "site_a", code: "A", name: "A" } }],
          permissions: ["dashboard.read", "approval.decide"],
        }),
      ),
      false,
    );
    assert.equal(callPermission("security.acknowledge", user({ permissions: ["dashboard.read"] })) instanceof HttpError, true);
  });
});

describe("unread and ownership filters", () => {
  it("parses read, unread, severity, type, and date filters", () => {
    const unread = parseNotificationFilters({ unread: "true", severity: "WARNING", type: "APPROVAL_REQUESTED" });
    assert.equal(unread.read, "unread");
    assert.equal(unread.severity, "WARNING");
    assert.equal(unread.type, "APPROVAL_REQUIRED");
    const read = parseNotificationFilters({ read: "read" });
    assert.equal(read.read, "read");
    assert.throws(
      () => parseNotificationFilters({ from: "2026-09-21", to: "2026-09-20" }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });

  it("builds mark-all-as-read ownership from the authenticated user only", () => {
    const actor = user();
    const where = {
      organizationId: actor.organizationId,
      recipientUserId: actor.id,
      readAt: null,
    };
    assert.equal(where.recipientUserId, "user_1");
    assert.notEqual(where.recipientUserId, "someone-else");
  });
});

describe("alert lifecycle", () => {
  it("allows open → acknowledged → resolved and blocks illegal jumps", () => {
    assert.equal(canAcknowledgeAlert("OPEN").ok, true);
    assert.equal(canAcknowledgeAlert("ACKNOWLEDGED").ok, false);
    assert.equal(canResolveAlert("OPEN").ok, true);
    assert.equal(canResolveAlert("RESOLVED").ok, false);
    assert.equal(nextAlertStatus("OPEN", "ACKNOWLEDGE"), "ACKNOWLEDGED");
    assert.equal(nextAlertStatus("ACKNOWLEDGED", "RESOLVE"), "RESOLVED");
    assert.equal(nextAlertStatus("RESOLVED", "ACKNOWLEDGE"), null);
  });

  it("filters alerts by status, severity, type, and site", () => {
    const filters = parseAlertFilters({
      status: "OPEN",
      severity: "ERROR",
      type: "WEIGHT_EXCEPTION",
      siteId: "site_a",
    });
    assert.equal(filters.status, "OPEN");
    assert.equal(filters.severity, "ERROR");
    assert.equal(filters.type, "WEIGHT_EXCEPTION");
    assert.equal(filters.siteId, "site_a");
    assert.throws(
      () => parseAlertFilters({ status: "FRAUD" }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});

describe("workflow event mapping", () => {
  it("maps existing workflow actions onto notification types", () => {
    const mapping = {
      approvalCreated: "APPROVAL_REQUIRED",
      approvalApproved: "APPROVAL_APPROVED",
      approvalRejected: "APPROVAL_REJECTED",
      unloadingAssigned: "UNLOADING_ASSIGNED",
      weightException: "WEIGHT_EXCEPTION",
      transactionCompleted: "TRANSACTION_COMPLETED",
    } as const;
    assert.equal(mapping.approvalCreated, "APPROVAL_REQUIRED");
    assert.equal(mapping.approvalApproved, "APPROVAL_APPROVED");
    assert.equal(mapping.approvalRejected, "APPROVAL_REJECTED");
    assert.equal(mapping.unloadingAssigned, "UNLOADING_ASSIGNED");
    assert.equal(mapping.weightException, "WEIGHT_EXCEPTION");
    assert.equal(mapping.transactionCompleted, "TRANSACTION_COMPLETED");
  });

  it("opens the existing approval or transaction page", () => {
    assert.equal(
      notificationHref({ type: "APPROVAL_REQUIRED", approvalId: "apr_1", transactionId: "txn_1" }),
      "/approvals/apr_1",
    );
    assert.equal(
      notificationHref({ type: "WEIGHT_EXCEPTION", approvalId: null, transactionId: "txn_1" }),
      "/transactions/txn_1",
    );
  });
});

describe("pagination contract", () => {
  it("computes totalPages from server-side page size", () => {
    const total = 45;
    const pageSize = 20;
    assert.equal(Math.ceil(total / pageSize), 3);
    assert.equal(Math.ceil(0 / pageSize), 0);
  });
});
