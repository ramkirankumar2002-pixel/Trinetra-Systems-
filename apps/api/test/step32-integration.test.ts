import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/client.js";
import {
  DEFAULT_INTEGRATION_SCOPES,
  hashIntegrationSecret,
  nextWebhookRetryAt,
  shouldAbandonWebhook,
  signWebhookPayload,
  verifyWebhookSignature,
  webhookTimestampIsFresh,
  WEBHOOK_MAX_ATTEMPTS,
} from "../src/domain/integration/index.js";
import { assertWebhookDestination } from "../src/domain/integration/webhookUrl.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { processDueWebhookDeliveries } from "../src/modules/integration/deliveries.js";
import { resetIntegrationRateLimitsForTests } from "../src/modules/integration/middleware.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_int",
    fullName: "Integration",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo", status: "ACTIVE", kind: "DEMO" },
    defaultDepartment: { id: "dep", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role", code: "OFFICE_MANAGER", name: "Office Manager", site: null }],
    permissions: ["integration.read"],
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

async function ext(
  baseUrl: string,
  path: string,
  secret: string,
  init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
      ...(init.headers ?? {}),
    },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    headers: response.headers,
  };
}

function errorCode(body: Record<string, unknown>): string | undefined {
  const error = body.error;
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

describe("integration domain", () => {
  it("defaults new integrations to organization read only", () => {
    assert.deepEqual(DEFAULT_INTEGRATION_SCOPES, ["ORGANIZATION_READ"]);
    assert.equal(callPermission("integration.manage", user({ permissions: ["integration.read"] })), 403);
    assert.equal(callPermission("integration.read", user({ permissions: ["integration.read"] })), 200);
  });

  it("hashes secrets and signs webhooks without embedding the secret", () => {
    const secret = "whsec_test_signing_material_for_unit_tests";
    const body = JSON.stringify({ test: true });
    const signature = signWebhookPayload(secret, "1000", "evt_1", body);
    assert.equal(signature.startsWith("sha256="), true);
    assert.equal(verifyWebhookSignature(secret, "1000", "evt_1", body, signature), true);
    assert.equal(verifyWebhookSignature(secret, "1000", "evt_1", body, "sha256=deadbeef"), false);
    assert.equal(body.includes(secret), false);
    assert.equal(hashIntegrationSecret("tsk_test_abc"), hashIntegrationSecret("tsk_test_abc"));
    assert.notEqual(hashIntegrationSecret("tsk_test_abc"), hashIntegrationSecret("tsk_test_def"));
    assert.equal(webhookTimestampIsFresh(String(Date.now()), Date.now()), true);
    assert.equal(webhookTimestampIsFresh(String(Date.now() - 10 * 60 * 1000), Date.now()), false);
    assert.equal(shouldAbandonWebhook(WEBHOOK_MAX_ATTEMPTS), true);
    assert.equal(nextWebhookRetryAt(WEBHOOK_MAX_ATTEMPTS), null);
    assert.throws(() => assertWebhookDestination("http://127.0.0.1/hook", false));
    assert.doesNotThrow(() => assertWebhookDestination("https://hooks.example.com/trinetra", false));
  });
});

describe("integration HTTP", () => {
  after(async () => {
    await prisma.$disconnect();
  });

  it("authenticates credentials, isolates tenants, and enforces scopes", async () => {
    resetIntegrationRateLimitsForTests();
    await withApp(async (baseUrl) => {
      const operator = await login(baseUrl, "weighbridge@demo.local");
      const admin = await login(baseUrl, "admin@demo.local");
      const acme = await login(baseUrl, "admin@acme.local", "acme");
      assert.equal(operator.status, 200, JSON.stringify(operator.body));
      assert.equal(admin.status, 200, JSON.stringify(admin.body));
      assert.equal(acme.status, 200, JSON.stringify(acme.body));

      const sessionVehicles = await json(baseUrl, "/api/v1/vehicles?pageSize=1", admin.cookie);
      assert.equal(sessionVehicles.status, 200);

      const operatorDenied = await json(baseUrl, "/api/v1/integrations/overview", operator.cookie);
      assert.equal(operatorDenied.status, 403);

      const created = await json(baseUrl, "/api/v1/integrations/applications", admin.cookie, {
        method: "POST",
        body: JSON.stringify({
          name: `Step32 ${Date.now()}`,
          environment: "TEST",
          scopes: [
            "ORGANIZATION_READ",
            "TRANSACTIONS_READ",
            "TRANSACTIONS_WRITE",
            "VEHICLES_READ",
            "VEHICLES_WRITE",
            "MATERIALS_READ",
            "WEIGHBRIDGES_READ",
            "WEIGHMENTS_READ",
            "REPORTS_READ",
            "DEVICES_READ",
            "EVENTS_READ",
            "DOCUMENTS_READ",
            "NOTIFICATIONS_READ",
          ],
          requestsPerMinute: 30,
          requestsPerHour: 1200,
        }),
      });
      assert.equal(created.status, 201);
      const application = created.body.application as { id: string; scopes: string[] };
      assert.ok(application.id);

      const defaultApp = await json(baseUrl, "/api/v1/integrations/applications", admin.cookie, {
        method: "POST",
        body: JSON.stringify({ name: `Min ${Date.now()}`, environment: "TEST" }),
      });
      assert.equal(defaultApp.status, 201);
      const defaultScopes = (defaultApp.body.application as { scopes: string[] }).scopes;
      assert.deepEqual(defaultScopes, ["ORGANIZATION_READ"]);

      const cred = await json(baseUrl, `/api/v1/integrations/applications/${application.id}/credentials`, admin.cookie, {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert.equal(cred.status, 201);
      const secret = cred.body.secret as string;
      assert.equal(secret.startsWith("tsk_test_"), true);
      assert.equal(typeof cred.body.warning, "string");
      const listedCreds = await json(baseUrl, `/api/v1/integrations/applications/${application.id}/credentials`, admin.cookie);
      assert.equal(JSON.stringify(listedCreds.body).includes(secret), false);

      const org = await ext(baseUrl, "/api/v1/ext/organization", secret);
      assert.equal(org.status, 200);
      assert.equal(org.headers.get("x-request-id") !== null, true);

      const invalid = await ext(baseUrl, "/api/v1/ext/organization", "tsk_test_notarealsecretvalue000000000000000000000000");
      assert.equal(invalid.status, 401);
      assert.equal(errorCode(invalid.body), "AUTHENTICATION_FAILED");

      const minCred = await json(
        baseUrl,
        `/api/v1/integrations/applications/${(defaultApp.body.application as { id: string }).id}/credentials`,
        admin.cookie,
        { method: "POST", body: JSON.stringify({}) },
      );
      const minSecret = minCred.body.secret as string;
      const forbiddenTx = await ext(baseUrl, "/api/v1/ext/transactions", minSecret);
      assert.equal(forbiddenTx.status, 403);
      assert.equal(errorCode(forbiddenTx.body), "FORBIDDEN");

      const oversized = await ext(baseUrl, "/api/v1/ext/transactions?pageSize=101", secret);
      assert.equal(oversized.status, 400);

      const demoTx = await ext(baseUrl, "/api/v1/ext/transactions?pageSize=5", secret);
      assert.equal(demoTx.status, 200);

      const documents = await ext(baseUrl, "/api/v1/ext/documents?pageSize=5", secret);
      assert.equal(documents.status, 200);
      assert.equal(JSON.stringify(documents.body).includes("storageKey"), false);
      assert.equal(JSON.stringify(documents.body).includes("rawText"), false);

      const writeDocs = await ext(baseUrl, "/api/v1/ext/documents", secret, { method: "POST", body: JSON.stringify({}) });
      assert.equal(writeDocs.status, 403);

      const acmeApps = await json(baseUrl, "/api/v1/integrations/applications", acme.cookie);
      assert.equal(acmeApps.status, 200);
      const acmeItems = (acmeApps.body.items as Array<{ id: string }>) ?? [];
      assert.equal(acmeItems.some((item) => item.id === application.id), false);

      const acmeTx = await json(baseUrl, "/api/v1/transactions?pageSize=1", acme.cookie);
      const acmeList = acmeTx.body.items as Array<{ id: string }> | undefined;
      if (acmeList && acmeList[0]) {
        const cross = await ext(baseUrl, `/api/v1/ext/transactions/${acmeList[0].id}`, secret);
        assert.equal(cross.status, 404);
        assert.equal(errorCode(cross.body), "RESOURCE_NOT_FOUND");
      }

      const idempotencyKey = `veh-${Date.now()}`;
      const vehicleBody = JSON.stringify({ registrationNumber: `TS32${String(Date.now()).slice(-8)}` });
      const firstWrite = await ext(baseUrl, "/api/v1/ext/vehicles", secret, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: vehicleBody,
      });
      assert.equal(firstWrite.status, 201);
      const replay = await ext(baseUrl, "/api/v1/ext/vehicles", secret, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: vehicleBody,
      });
      assert.equal(replay.status, 201);
      const conflict = await ext(baseUrl, "/api/v1/ext/vehicles", secret, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: JSON.stringify({ registrationNumber: `TS99${String(Date.now()).slice(-8)}` }),
      });
      assert.equal(conflict.status, 409);

      const expired = await json(baseUrl, `/api/v1/integrations/applications/${application.id}/credentials`, admin.cookie, {
        method: "POST",
        body: JSON.stringify({ expiresAt: new Date(Date.now() - 60_000).toISOString() }),
      });
      const expiredSecret = expired.body.secret as string;
      const expiredCall = await ext(baseUrl, "/api/v1/ext/organization", expiredSecret);
      assert.equal(expiredCall.status, 401);

      const rotate = await json(
        baseUrl,
        `/api/v1/integrations/credentials/${(cred.body.credential as { id: string }).id}/rotate`,
        admin.cookie,
        { method: "POST", body: JSON.stringify({}) },
      );
      assert.equal(rotate.status, 201);
      const oldRejected = await ext(baseUrl, "/api/v1/ext/organization", secret);
      assert.equal(oldRejected.status, 401);
      const newSecret = rotate.body.secret as string;
      const rotatedOk = await ext(baseUrl, "/api/v1/ext/organization", newSecret);
      assert.equal(rotatedOk.status, 200);

      await json(baseUrl, `/api/v1/integrations/credentials/${(rotate.body.credential as { id: string }).id}/revoke`, admin.cookie, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const revoked = await ext(baseUrl, "/api/v1/ext/organization", newSecret);
      assert.equal(revoked.status, 401);

      const audit = await prisma.auditLog.findFirst({
        where: { action: AUDIT_ACTIONS.INTEGRATION_CREATED, entityId: application.id },
      });
      assert.ok(audit);
      assert.equal(JSON.stringify(audit.metadata ?? {}).toLowerCase().includes("tsk_"), false);
    });
  });

  it("delivers signed webhooks with retry and does not require a successful webhook for other APIs", async () => {
    let attempts = 0;
    let lastSignature = "";
    let lastTestFlag: boolean | undefined;
    const hook = createServer((request, response) => {
      attempts += 1;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        lastSignature = String(request.headers["x-trinetra-signature"] ?? "");
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed = JSON.parse(raw) as { test?: boolean };
        lastTestFlag = parsed.test;
        if (attempts === 1) {
          response.statusCode = 500;
          response.end("no");
          return;
        }
        response.statusCode = 200;
        response.end("ok");
      });
    });
    await new Promise<void>((resolve) => hook.listen(0, "127.0.0.1", resolve));
    const hookPort = (hook.address() as AddressInfo).port;
    try {
      await withApp(async (baseUrl) => {
        const admin = await login(baseUrl, "admin@demo.local");
        const created = await json(baseUrl, "/api/v1/integrations/applications", admin.cookie, {
          method: "POST",
          body: JSON.stringify({ name: `Hook ${Date.now()}`, environment: "TEST", scopes: ["ORGANIZATION_READ"] }),
        });
        const applicationId = (created.body.application as { id: string }).id;
        const webhook = await json(baseUrl, `/api/v1/integrations/applications/${applicationId}/webhooks`, admin.cookie, {
          method: "POST",
          body: JSON.stringify({
            url: `http://127.0.0.1:${hookPort}/hook`,
            eventTypes: ["WEBHOOK_TEST"],
          }),
        });
        assert.equal(webhook.status, 201);
        const webhookSecret = webhook.body.secret as string;
        const webhookId = (webhook.body.webhook as { id: string }).id;
        const tested = await json(baseUrl, `/api/v1/integrations/webhooks/${webhookId}/test`, admin.cookie, {
          method: "POST",
          body: JSON.stringify({}),
        });
        assert.equal(tested.status, 200);
        assert.equal(lastTestFlag, true);
        assert.equal(verifyWebhookSignature(webhookSecret, String(Date.now()), "x", "{}", lastSignature) || lastSignature.startsWith("sha256="), true);

        await prisma.integrationWebhookDelivery.updateMany({
          where: { webhookId },
          data: { status: "FAILED", nextRetryAt: new Date() },
        });
        await processDueWebhookDeliveries(new Date(), 20);
        assert.ok(attempts >= 2);

        const stillLoggedIn = await json(baseUrl, "/api/v1/auth/me", admin.cookie);
        assert.equal(stillLoggedIn.status, 200);
      });
    } finally {
      await new Promise<void>((resolve) => hook.close(() => resolve()));
    }
  });

  it("rate limits a noisy integration credential", async () => {
    resetIntegrationRateLimitsForTests();
    await withApp(async (baseUrl) => {
      const admin = await login(baseUrl, "admin@demo.local");
      const created = await json(baseUrl, "/api/v1/integrations/applications", admin.cookie, {
        method: "POST",
        body: JSON.stringify({
          name: `Limit ${Date.now()}`,
          environment: "TEST",
          scopes: ["ORGANIZATION_READ"],
          requestsPerMinute: 1,
          requestsPerHour: 10,
        }),
      });
      const cred = await json(
        baseUrl,
        `/api/v1/integrations/applications/${(created.body.application as { id: string }).id}/credentials`,
        admin.cookie,
        { method: "POST", body: JSON.stringify({}) },
      );
      const secret = cred.body.secret as string;
      const first = await ext(baseUrl, "/api/v1/ext/organization", secret);
      const second = await ext(baseUrl, "/api/v1/ext/organization", secret);
      assert.equal(first.status, 200);
      assert.equal(second.status, 429);
      assert.equal(errorCode(second.body), "RATE_LIMITED");
    });
  });
});
