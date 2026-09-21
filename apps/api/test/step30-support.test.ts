import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import {
  assertTicketTransition,
  canTransitionTicket,
  canTransitionMaintenance,
  isAdminAssignablePermission,
} from "../src/domain/support/index.js";
import { getNotificationDefinition, notificationHref } from "../src/domain/notificationCatalog.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_support",
    fullName: "Support",
    email: "support@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo", status: "ACTIVE", kind: "DEMO" },
    defaultDepartment: { id: "dep", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role", code: "SUPPORT_ENGINEER", name: "Support Engineer", site: null }],
    permissions: ["support.ticket.read", "support.internal"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function callPermission(code: string, auth: AuthenticatedUser): number {
  const middleware = requirePermission(code);
  let status = 200;
  middleware({ auth } as Request, {} as Response, ((error?: unknown) => {
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
      status = error.status;
    }
  }) as NextFunction);
  return status;
}

async function withApp(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function login(
  baseUrl: string,
  email: string,
  organizationSlug?: string,
): Promise<{ status: number; cookie: string; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "demo-password",
      ...(organizationSlug ? { organizationSlug } : {}),
    }),
  });
  return {
    status: response.status,
    cookie: response.headers.getSetCookie().join("; "),
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function json(
  baseUrl: string,
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie,
      ...(init.headers ?? {}),
    },
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("support domain", () => {
  it("rejects invalid ticket and maintenance transitions", () => {
    assert.equal(canTransitionTicket("OPEN", "ACKNOWLEDGED"), true);
    assert.equal(canTransitionTicket("CLOSED", "OPEN"), false);
    assert.throws(() => assertTicketTransition("RESOLVED", "CANCELLED"));
    assert.equal(canTransitionMaintenance("SCHEDULED", "IN_PROGRESS"), true);
    assert.equal(canTransitionMaintenance("COMPLETED", "IN_PROGRESS"), false);
  });

  it("keeps internal notes off the customer administrator permission set", () => {
    assert.equal(isAdminAssignablePermission("support.ticket.manage"), true);
    assert.equal(isAdminAssignablePermission("support.internal"), false);
    assert.equal(isAdminAssignablePermission("onboarding.view"), false);
    assert.equal(callPermission("support.internal", user({ permissions: ["support.ticket.manage"] })), 403);
    assert.equal(callPermission("support.internal", user({ permissions: ["support.internal"] })), 200);
  });

  it("routes support notifications to existing ticket and maintenance screens", () => {
    assert.equal(getNotificationDefinition("SUPPORT_TICKET_CRITICAL").createAlert, true);
    assert.equal(getNotificationDefinition("SUPPORT_TICKET_CREATED").createAlert, false);
    assert.equal(
      notificationHref({ type: "SUPPORT_TICKET_CREATED", approvalId: null, transactionId: null, entityType: "SupportTicket", entityId: "t1" }),
      "/support/tickets/t1",
    );
    assert.equal(
      notificationHref({
        type: "SUPPORT_MAINTENANCE_COMPLETED",
        approvalId: null,
        transactionId: null,
        entityType: "ServiceMaintenanceRecord",
        entityId: "m1",
      }),
      "/maintenance/m1",
    );
  });
});

describe("support HTTP", () => {
  after(async () => {
    await prisma.$disconnect();
  });

  it("creates, assigns, transitions, comments, and isolates tickets", async () => {
    await withApp(async (baseUrl) => {
      const operator = await login(baseUrl, "weighbridge@demo.local");
      const support = await login(baseUrl, "support@demo.local");
      const admin = await login(baseUrl, "admin@demo.local");
      const siteB = await login(baseUrl, "site-b@demo.local");
      const acme = await login(baseUrl, "admin@acme.local", "acme");
      assert.equal(operator.status, 200);
      assert.equal(support.status, 200);
      assert.equal(acme.status, 200);

      const operatorUser = operator.body.user as { defaultSite: { id: string }; id: string };
      const supportUser = support.body.user as { id: string; permissions: string[] };
      assert.equal(supportUser.permissions.includes("support.internal"), true);
      const adminUser = admin.body.user as { permissions: string[] };
      assert.equal(adminUser.permissions.includes("support.internal"), false);

      const created = await json(baseUrl, "/api/v1/support/tickets", operator.cookie, {
        method: "POST",
        body: JSON.stringify({
          siteId: operatorUser.defaultSite.id,
          subject: "Indicator not updating",
          description: "Live weight stayed on the last value after reconnect.",
          category: "WEIGHBRIDGE",
          priority: "HIGH",
        }),
      });
      assert.equal(created.status, 201);
      const ticket = created.body.ticket as {
        id: string;
        ticketNumber: string;
        status: string;
        activities: Array<{ visibility: string; description: string }>;
      };
      assert.match(ticket.ticketNumber, /^SUP-\d{4}-\d{6}$/);
      assert.equal(ticket.status, "OPEN");

      const stolen = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}`, acme.cookie);
      assert.equal(stolen.status, 404);

      const otherSite = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}`, siteB.cookie);
      assert.equal(otherSite.status, 403);

      const forbiddenAssign = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/assign`, operator.cookie, {
        method: "POST",
        body: JSON.stringify({ assignedUserId: supportUser.id }),
      });
      assert.equal(forbiddenAssign.status, 403);

      const assigned = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/assign`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ assignedUserId: supportUser.id, assignedTeam: "Trinetra Support" }),
      });
      assert.equal(assigned.status, 200);

      const invalid = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/status`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ status: "CLOSED", expectedStatus: "OPEN" }),
      });
      assert.equal(invalid.status, 409);

      const acknowledged = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/status`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ status: "ACKNOWLEDGED", expectedStatus: "OPEN" }),
      });
      assert.equal(acknowledged.status, 200);
      const stale = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/status`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ status: "IN_PROGRESS", expectedStatus: "OPEN" }),
      });
      assert.equal(stale.status, 409);

      await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/status`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ status: "IN_PROGRESS", expectedStatus: "ACKNOWLEDGED" }),
      });
      const resolved = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/status`, support.cookie, {
        method: "POST",
        body: JSON.stringify({
          status: "RESOLVED",
          expectedStatus: "IN_PROGRESS",
          resolutionSummary: "Simulator resumed after reconnect.",
        }),
      });
      assert.equal(resolved.status, 200);

      const internal = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/comments`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ body: "Check reconnect delay before changing indicator settings.", internal: true }),
      });
      assert.equal(internal.status, 200);
      const supportView = (internal.body.ticket as { activities: Array<{ visibility: string; description: string }> }).activities;
      assert.equal(supportView.some((activity) => activity.visibility === "INTERNAL"), true);

      const customerView = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}`, operator.cookie);
      const customerActivities = (customerView.body.ticket as { activities: Array<{ visibility: string }> }).activities;
      assert.equal(customerActivities.some((activity) => activity.visibility === "INTERNAL"), false);

      const adminView = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}`, admin.cookie);
      const adminActivities = (adminView.body.ticket as { canSeeInternal: boolean; activities: Array<{ visibility: string }> }).activities;
      assert.equal((adminView.body.ticket as { canSeeInternal: boolean }).canSeeInternal, false);
      assert.equal(adminActivities.some((activity) => activity.visibility === "INTERNAL"), false);

      const closed = await json(baseUrl, `/api/v1/support/tickets/${ticket.id}/close`, operator.cookie, {
        method: "POST",
        body: "{}",
      });
      assert.equal(closed.status, 200);

      const listed = await json(baseUrl, "/api/v1/support/tickets?page=1&pageSize=20", operator.cookie);
      assert.equal(listed.status, 200);
      assert.equal(typeof (listed.body.total as number), "number");

      const audits = await prisma.auditLog.findMany({
        where: { entityType: "SupportTicket", entityId: ticket.id },
        select: { action: true },
      });
      const actions = audits.map((row) => row.action);
      assert.equal(actions.includes(AUDIT_ACTIONS.SUPPORT_TICKET_CREATED), true);
      assert.equal(actions.includes(AUDIT_ACTIONS.SUPPORT_TICKET_ASSIGNED), true);
      assert.equal(actions.includes(AUDIT_ACTIONS.SUPPORT_TICKET_CLOSED), true);

      const notifications = await prisma.notification.findMany({
        where: { entityId: ticket.id, type: { in: ["SUPPORT_TICKET_CREATED", "SUPPORT_TICKET_ASSIGNED"] } },
      });
      assert.equal(notifications.length > 0, true);

      const device = await prisma.edgeDevice.findFirst({
        where: { organizationId: (support.body.user as { organization: { id: string } }).organization.id, code: "WB-01" },
        select: { id: true, siteId: true, weighbridgeId: true },
      });
      assert.ok(device);

      const maintenance = await json(baseUrl, "/api/v1/support/maintenance", support.cookie, {
        method: "POST",
        body: JSON.stringify({
          siteId: device.siteId,
          type: "INSPECTION",
          reason: "Follow-up inspection",
          description: "Record findings after the reconnect delay.",
          deviceId: device.id,
          weighbridgeId: device.weighbridgeId,
          startNow: true,
        }),
      });
      assert.equal(maintenance.status, 201);
      const record = maintenance.body.maintenance as { id: string; status: string; recordNumber: string };
      assert.equal(record.status, "IN_PROGRESS");
      const completed = await json(baseUrl, `/api/v1/support/maintenance/${record.id}/complete`, support.cookie, {
        method: "POST",
        body: JSON.stringify({ findings: "Simulator healthy.", actionTaken: "No hardware change." }),
      });
      assert.equal(completed.status, 200);
      assert.equal((completed.body.maintenance as { status: string }).status, "COMPLETED");

      const cancelledCreate = await json(baseUrl, "/api/v1/support/maintenance", support.cookie, {
        method: "POST",
        body: JSON.stringify({
          siteId: device.siteId,
          type: "OTHER",
          reason: "Will cancel",
          description: "Invalid lifecycle check.",
        }),
      });
      const cancelId = (cancelledCreate.body.maintenance as { id: string }).id;
      const badComplete = await json(baseUrl, `/api/v1/support/maintenance/${cancelId}/complete`, support.cookie, {
        method: "POST",
        body: "{}",
      });
      assert.equal(badComplete.status, 409);

      const history = await json(baseUrl, `/api/v1/support/devices/${device.id}/history`, support.cookie);
      assert.equal(history.status, 200);
      assert.equal(((history.body.device as { id: string }).id), device.id);

      const acmeHistory = await json(baseUrl, `/api/v1/support/devices/${device.id}/history`, acme.cookie);
      assert.equal(acmeHistory.status, 404);

      const dashboard = await json(baseUrl, "/api/v1/support/dashboard", support.cookie);
      assert.equal(dashboard.status, 200);
      assert.equal(typeof ((dashboard.body.kpis as { openTickets: number }).openTickets), "number");
    });
  });
});
