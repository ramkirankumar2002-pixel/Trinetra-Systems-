import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import { GATEWAY_NOT_CONNECTED_MESSAGE, ONBOARDING_STEP_KEYS } from "../src/domain/onboarding/catalog.js";
import { canCompleteStep, completionPercent, frontierStep, withCompletedStep } from "../src/domain/onboarding/progress.js";
import {
  buildPilotReadiness,
  buildValidationFindings,
  hasBlockingErrors,
  unacceptedWarnings,
  type OnboardingValidationSnapshot,
} from "../src/domain/onboarding/validation.js";
import { PROTOCOL_INFORMATION_REQUIRED_MESSAGE } from "../src/domain/protocolReadiness.js";
import { canPublishWorkflow } from "../src/domain/onboarding/workflowPublish.js";
import { MASTER_DATA_SCOPES } from "../src/domain/tenancy/scope.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

function snapshot(overrides: Partial<OnboardingValidationSnapshot> = {}): OnboardingValidationSnapshot {
  return {
    organization: { exists: true, active: true, name: "Demo" },
    site: { exists: true, active: true, name: "Demo Site" },
    users: { administratorExists: true, total: 2 },
    rbac: { missingPermissions: [] },
    weighbridge: { configured: true, name: "WB-01" },
    gateway: { registered: true, connected: true, status: "ONLINE" },
    devices: {
      indicatorConfigured: true,
      anprConfigured: true,
      scannerConfigured: true,
      protocolInformationRequired: false,
    },
    materials: [{ name: "Cement", code: "CEMENT", hasPublishedWorkflow: true }],
    workflows: [
      {
        name: "Inbound",
        code: "INBOUND",
        isActive: true,
        steps: [
          { capability: "IDENTIFY_VEHICLE", isRequired: true, name: "Identify" },
          { capability: "COMPLETE", isRequired: true, name: "Complete" },
        ],
      },
    ],
    documents: { configured: true },
    unloading: { configured: true },
    notifications: { recipientsConfigured: true },
    language: { defaultConfigured: true },
    hardwareTests: {
      weightTested: true,
      weightOk: true,
      anprTested: false,
      anprOk: false,
      scannerTested: false,
      scannerOk: false,
    },
    loginWorks: true,
    siteIsolationConfigured: true,
    offlinePolicyAvailable: true,
    monitoringAvailable: true,
    backupConfigured: false,
    operationMode: "SIMULATION",
    ...overrides,
  };
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_impl",
    fullName: "Implement",
    email: "implement@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo", status: "ACTIVE", kind: "DEMO" },
    defaultDepartment: { id: "dep", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role", code: "IMPLEMENTATION_ENGINEER", name: "Implementation Engineer", site: null }],
    permissions: ["onboarding.view", "onboarding.create"],
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

describe("onboarding domain", () => {
  it("blocks skipping mandatory steps and computes progress", () => {
    assert.equal(canCompleteStep([], "ORGANIZATION"), true);
    assert.equal(canCompleteStep([], "MATERIALS"), false);
    assert.equal(canCompleteStep(["ORGANIZATION", "SITE"], "DEPARTMENTS"), true);
    assert.equal(completionPercent(ONBOARDING_STEP_KEYS), 100);
    assert.equal(
      frontierStep(withCompletedStep(["ORGANIZATION", "SITE", "DEPARTMENTS", "USERS", "WEIGHBRIDGE"], "ORGANIZATION")),
      "GATEWAY",
    );
    assert.equal(MASTER_DATA_SCOPES.onboardingSession, "ORGANIZATION");
  });

  it("rejects invalid workflows and unpublished material assignments", () => {
    assert.equal(
      canPublishWorkflow({
        name: "Broken",
        code: "BROKEN",
        isActive: true,
        steps: [{ capability: "APPROVAL", isRequired: true, name: "Approve" }],
      }),
      false,
    );
    const findings = buildValidationFindings(
      snapshot({
        materials: [{ name: "Cement", code: "CEMENT", hasPublishedWorkflow: false }],
        gateway: { registered: true, connected: false, status: "OFFLINE" },
        devices: {
          indicatorConfigured: true,
          anprConfigured: true,
          scannerConfigured: false,
          protocolInformationRequired: true,
        },
      }),
    );
    assert.equal(
      findings.some((finding) => finding.message === "No published workflow exists for material Cement."),
      true,
    );
    assert.equal(findings.some((finding) => finding.message === GATEWAY_NOT_CONNECTED_MESSAGE), true);
    assert.equal(findings.some((finding) => finding.message === PROTOCOL_INFORMATION_REQUIRED_MESSAGE), true);
    assert.equal(hasBlockingErrors(findings), true);
  });

  it("keeps untested hardware as not tested in readiness", () => {
    const items = buildPilotReadiness(
      snapshot({
        hardwareTests: {
          weightTested: false,
          weightOk: false,
          anprTested: false,
          anprOk: false,
          scannerTested: false,
          scannerOk: false,
        },
        devices: {
          indicatorConfigured: true,
          anprConfigured: true,
          scannerConfigured: true,
          protocolInformationRequired: false,
        },
      }),
    );
    assert.equal(items.find((item) => item.key === "weight")?.status, "NOT_TESTED");
    assert.equal(items.find((item) => item.key === "backup")?.status, "WARNING");
    assert.equal(
      unacceptedWarnings(
        [{ key: "gateway.offline", area: "GATEWAY", severity: "WARNING", message: GATEWAY_NOT_CONNECTED_MESSAGE }],
        [],
      ).length,
      1,
    );
  });

  it("does not grant onboarding permissions to ordinary administrators", () => {
    assert.equal(callPermission("onboarding.create", user({ permissions: ["user.manage"] })), 403);
    assert.equal(callPermission("onboarding.create", user()), 200);
  });
});

describe("onboarding HTTP API", () => {
  after(async () => {
    await prisma.edgeGateway.updateMany({
      where: { code: "TRINETRA-EDGE-01" },
      data: { lastHeartbeatAt: null, status: "PENDING" },
    });
    await prisma.$disconnect();
  });

  async function cancelOpenSessions(): Promise<void> {
    await prisma.onboardingSession.updateMany({
      where: { status: { in: ["DRAFT", "IN_PROGRESS", "READY_FOR_VALIDATION", "BLOCKED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  }

  it("enforces permissions, resume, isolation, validation, completion, and cancellation", async () => {
    await cancelOpenSessions();
    await withApp(async (baseUrl) => {
      const office = await login(baseUrl, "office@demo.local");
      const admin = await login(baseUrl, "admin@demo.local");
      const acme = await login(baseUrl, "admin@acme.local", "acme");
      const implement = await login(baseUrl, "implement@demo.local");
      assert.equal(office.status, 200);
      assert.equal(admin.status, 200);
      assert.equal(acme.status, 200);
      assert.equal(implement.status, 200);

      assert.equal((await json(baseUrl, "/api/v1/onboarding", office.cookie, { method: "POST", body: "{}" })).status, 403);
      assert.equal((await json(baseUrl, "/api/v1/onboarding", admin.cookie, { method: "POST", body: "{}" })).status, 403);
      assert.equal((await json(baseUrl, "/api/v1/onboarding", acme.cookie, { method: "POST", body: "{}" })).status, 403);

      const created = await json(baseUrl, "/api/v1/onboarding", implement.cookie, { method: "POST", body: "{}" });
      assert.equal(created.status, 201);
      const session = created.body.session as Record<string, unknown>;
      const sessionId = String(session.id);
      const resumed = await json(baseUrl, "/api/v1/onboarding", implement.cookie, { method: "POST", body: "{}" });
      assert.equal(resumed.status, 201);
      assert.equal((resumed.body.session as Record<string, unknown>).id, sessionId);

      const skipped = await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({ step: "MATERIALS", complete: true, payload: {} }),
      });
      assert.equal(skipped.status, 409);

      const otherOrg = await json(baseUrl, `/api/v1/onboarding/${sessionId}`, acme.cookie);
      assert.equal(otherOrg.status, 403);

      const viewPermission = await prisma.permission.findFirst({ where: { code: "onboarding.view" } });
      const acmeAdmin = await prisma.user.findFirst({
        where: { email: "admin@acme.local" },
        include: { userRoles: { include: { role: { select: { id: true, code: true } } } } },
      });
      const acmeAdminRole = acmeAdmin?.userRoles.find((assignment) => assignment.role.code === "ADMIN")?.role;
      assert.ok(viewPermission);
      assert.ok(acmeAdminRole);
      const hadView = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: acmeAdminRole.id, permissionId: viewPermission.id } },
      });
      if (!hadView) {
        await prisma.rolePermission.create({
          data: { roleId: acmeAdminRole.id, permissionId: viewPermission.id },
        });
      }
      try {
        const acmeWithView = await login(baseUrl, "admin@acme.local", "acme");
        const stolen = await json(baseUrl, `/api/v1/onboarding/${sessionId}`, acmeWithView.cookie);
        assert.equal(stolen.status, 404);
      } finally {
        if (!hadView) {
          await prisma.rolePermission.deleteMany({
            where: { roleId: acmeAdminRole.id, permissionId: viewPermission.id },
          });
        }
      }

      await prisma.edgeGateway.updateMany({
        where: { code: "TRINETRA-EDGE-01" },
        data: { lastHeartbeatAt: new Date(), status: "ONLINE", enabled: true, revokedAt: null },
      });

      async function complete(step: string, payload: Record<string, unknown> = {}): Promise<number> {
        const result = await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
          method: "PATCH",
          body: JSON.stringify({ step, complete: true, payload }),
        });
        assert.equal(result.status, 200, `${step}: ${JSON.stringify(result.body)}`);
        return result.status;
      }

      await complete("ORGANIZATION", {
        name: "Demo Organization",
        code: "demo",
        defaultLanguage: "en",
        languages: ["en", "hi"],
        voiceEnabled: true,
        audioEnabled: true,
      });
      await complete("SITE", { name: "Demo Site", code: "DEMO-SITE", timezone: "Asia/Kolkata" });
      await complete("DEPARTMENTS", {});
      await complete("USERS", {});
      await complete("WEIGHBRIDGE", {});
      await complete("GATEWAY", {});
      await complete("DEVICES", {});
      await complete("MATERIALS", {});
      await complete("WORKFLOWS", {});
      await complete("DOCUMENTS", { documentTypeCodes: ["INVOICE", "DELIVERY_CHALLAN"] });
      await complete("UNLOADING", {});

      const implementUser = implement.body.user as Record<string, unknown>;
      await complete("NOTIFICATIONS", {
        userId: implementUser.id,
        categories: ["APPROVAL", "EXCEPTION", "SYSTEM", "WORKFLOW"],
      });

      const hardware = await json(baseUrl, `/api/v1/onboarding/${sessionId}/hardware-checks`, implement.cookie, {
        method: "POST",
      });
      assert.equal(hardware.status, 200);

      const validated = await json(baseUrl, `/api/v1/onboarding/${sessionId}/validate`, implement.cookie, {
        method: "POST",
      });
      assert.equal(validated.status, 200);
      const findings = ((validated.body.validation as Record<string, unknown>).findings as Array<{ key: string; severity: string }>) ?? [];
      const warningKeys = findings.filter((finding) => finding.severity === "WARNING").map((finding) => finding.key);
      await complete("VALIDATION", { acceptedWarningKeys: warningKeys });
      await complete("PILOT_READINESS", {});

      const readiness = await json(baseUrl, `/api/v1/onboarding/${sessionId}/readiness`, implement.cookie, {
        method: "POST",
      });
      assert.equal(readiness.status, 200);

      const completed = await json(baseUrl, `/api/v1/onboarding/${sessionId}/complete`, implement.cookie, {
        method: "POST",
      });
      assert.equal(completed.status, 200);
      assert.equal((completed.body.session as Record<string, unknown>).status, "COMPLETED");

      const audits = await prisma.auditLog.count({
        where: {
          action: { in: [AUDIT_ACTIONS.ONBOARDING_STARTED, AUDIT_ACTIONS.ONBOARDING_COMPLETED] },
          entityId: sessionId,
        },
      });
      assert.equal(audits >= 2, true);

      const next = await json(baseUrl, "/api/v1/onboarding", implement.cookie, { method: "POST", body: "{}" });
      assert.equal(next.status, 201);
      const nextId = String((next.body.session as Record<string, unknown>).id);
      assert.notEqual(nextId, sessionId);
      const cancelled = await json(baseUrl, `/api/v1/onboarding/${nextId}/cancel`, implement.cookie, {
        method: "POST",
        body: JSON.stringify({ notes: "Stopped without deleting customer data" }),
      });
      assert.equal(cancelled.status, 200);
      assert.equal((cancelled.body.session as Record<string, unknown>).status, "CANCELLED");
      const me = await json(baseUrl, "/api/v1/auth/me", implement.cookie);
      assert.equal(me.status, 200);
      assert.equal(((me.body.user as Record<string, unknown>).organization as Record<string, unknown>).slug, "demo");
    });
  });

  it("refuses unsupported hardware protocols and offline gateways", async () => {
    await cancelOpenSessions();
    await withApp(async (baseUrl) => {
      const implement = await login(baseUrl, "implement@demo.local");
      const created = await json(baseUrl, "/api/v1/onboarding", implement.cookie, { method: "POST", body: "{}" });
      const sessionId = String((created.body.session as Record<string, unknown>).id);
      await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({
          step: "ORGANIZATION",
          complete: true,
          payload: { name: "Demo Organization", code: "demo", defaultLanguage: "en", languages: ["en"] },
        }),
      });
      await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({
          step: "SITE",
          complete: true,
          payload: { name: "Demo Site", code: "DEMO-SITE", timezone: "Asia/Kolkata" },
        }),
      });
      await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({ step: "DEPARTMENTS", complete: true, payload: {} }),
      });
      await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({ step: "USERS", complete: true, payload: {} }),
      });
      const serial = await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({
          step: "WEIGHBRIDGE",
          complete: true,
          payload: { name: "WB-X", code: "WB-X", hardwareMode: "SERIAL", unit: "KG" },
        }),
      });
      assert.equal(serial.status, 400);
      assert.match(String(serial.body.error), /Protocol information required/i);

      await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({ step: "WEIGHBRIDGE", complete: true, payload: {} }),
      });
      await prisma.edgeGateway.updateMany({
        where: { code: "TRINETRA-EDGE-01" },
        data: { lastHeartbeatAt: null, status: "PENDING" },
      });
      const offline = await json(baseUrl, `/api/v1/onboarding/${sessionId}/step`, implement.cookie, {
        method: "PATCH",
        body: JSON.stringify({ step: "GATEWAY", complete: true, payload: {} }),
      });
      assert.equal(offline.status, 409);
      assert.equal(offline.body.error, GATEWAY_NOT_CONNECTED_MESSAGE);
    });
  });
});
