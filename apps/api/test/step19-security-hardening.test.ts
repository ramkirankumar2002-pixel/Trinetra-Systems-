import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { TransactionStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { createApp } from "../src/app.js";
import { corsProductionIssue, isCorsOriginAllowed, jwtSecretIssue, parseCorsOrigins } from "../src/config/security.js";
import { env } from "../src/config/env.js";
import { canAcknowledgeAlert, canResolveAlert } from "../src/domain/alertLifecycle.js";
import { CURRENT_GATEWAY_AUTH_METHOD } from "../src/domain/edgeCredentials.js";
import { validateDocumentFile } from "../src/domain/documentFile.js";
import { canManageOperationalAlert } from "../src/domain/notificationRouting.js";
import { canTransition } from "../src/domain/transactionState.js";
import { parseWeightKg } from "../src/domain/weight.js";
import { redactValue } from "../src/lib/logger.js";
import { isSafeRouteId, routeParam } from "../src/lib/routeParam.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { readAccessToken } from "../src/modules/auth/session.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_site_a",
    fullName: "Site A",
    email: "a@demo.local",
    isActive: true,
    organization: { id: "org_a", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep", code: "WEIGHBRIDGE", name: "Weighbridge" },
    defaultSite: { id: "site_a", code: "A", name: "Site A" },
    roles: [{ id: "role_op", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: { id: "site_a", code: "A", name: "A" } }],
    permissions: ["transaction.read", "dashboard.read"],
    organizationId: "org_a",
    sessionId: "session",
    ...overrides,
  };
}

function denyStatus(permission: string, auth: AuthenticatedUser): number | undefined {
  let caught: unknown;
  requirePermission(permission)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      caught = error;
    }) as NextFunction,
  );
  return caught instanceof HttpError ? caught.status : undefined;
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
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("authentication hardening", () => {
  it("rejects invalid login payloads without revealing account state", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "x" }),
      });
      const body = (await response.json()) as { error?: string };
      assert.equal(response.status, 400);
      assert.equal(body.error, "A valid email is required");
      assert.equal(JSON.stringify(body).includes("passwordHash"), false);
    });
  });

  it("rejects expired access tokens", () => {
    const token = jwt.sign(
      {
        sub: "user_1",
        org: "org_1",
        jti: "session_1",
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      env.jwtSecret,
    );
    assert.throws(() => readAccessToken(token), (error: unknown) => {
      return error instanceof HttpError && error.status === 401 && error.message === "Not authenticated";
    });
  });

  it("rejects unauthenticated access to protected collections", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/transactions/trn123abc`);
      const body = (await response.json()) as { error?: string };
      assert.equal(response.status, 401);
      assert.equal(body.error, "Not authenticated");
    });
  });
});

describe("authorization and IDOR", () => {
  it("blocks role, department-adjacent, and missing permissions", () => {
    const operator = user();
    assert.equal(denyStatus("transaction.read", operator), undefined);
    assert.equal(denyStatus("audit.read", operator), 403);
    assert.equal(denyStatus("security.acknowledge", operator), 403);
    assert.equal(denyStatus("transaction.finalize", user({ permissions: ["transaction.read"] })), 403);
  });

  it("blocks site-scoped users from another site", () => {
    const operator = user();
    assert.equal(canAccessSite(operator, "site_a"), true);
    assert.equal(canAccessSite(operator, "site_b"), false);
  });

  it("does not treat dashboard.read as alert-management permission", () => {
    assert.equal(canManageOperationalAlert(user({ permissions: ["dashboard.read", "report.read"] })), false);
    assert.equal(
      canManageOperationalAlert(
        user({
          roles: [{ id: "admin", code: "ADMIN", name: "Admin", site: null }],
          permissions: ["security.acknowledge"],
        }),
      ),
      true,
    );
    assert.equal(denyStatus("security.acknowledge", user({ permissions: ["dashboard.read"] })), 403);
  });
});

describe("transactions, weights, and documents", () => {
  it("rejects illegal transaction jumps and duplicate-style completion paths", () => {
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.COMPLETED), false);
    assert.equal(canTransition(TransactionStatus.IDENTIFIED, TransactionStatus.COMPLETED), false);
    assert.equal(canTransition(TransactionStatus.COMPLETED, TransactionStatus.FIRST_WEIGHMENT), false);
    assert.equal(canTransition(TransactionStatus.SECOND_WEIGHMENT, TransactionStatus.COMPLETED), true);
  });

  it("rejects invalid weights including NaN and Infinity", () => {
    assert.equal(parseWeightKg(Number.NaN), "Weight must be a valid number");
    assert.equal(parseWeightKg(Number.POSITIVE_INFINITY), "Weight must be a valid number");
    assert.equal(parseWeightKg(-5), "Weight cannot be negative");
    assert.equal(parseWeightKg("1e9"), "Weight must be a positive number in kilograms");
  });

  it("rejects unauthorized-looking document types and oversized uploads", () => {
    const exe = validateDocumentFile({
      originalFileName: "payload.exe",
      declaredMimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
    assert.equal(exe, "Executable files cannot be uploaded as business documents");

    const oversized = validateDocumentFile(
      {
        originalFileName: "scan.pdf",
        declaredMimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 oversized"),
      },
      { maxBytes: 8 },
    );
    assert.match(String(oversized), /or smaller/);
  });
});

describe("offline, audit, and security events", () => {
  it("keeps gateway authentication on a shared credential with a future mTLS extension point", () => {
    assert.equal(CURRENT_GATEWAY_AUTH_METHOD, "SHARED_CREDENTIAL");
  });

  it("records important auth actions and has no audit-delete API", () => {
    assert.equal(AUDIT_ACTIONS.LOGIN_SUCCESS, "LOGIN_SUCCESS");
    assert.equal(AUDIT_ACTIONS.LOGIN_FAILED, "LOGIN_FAILED");
    assert.equal(AUDIT_ACTIONS.LOGOUT, "LOGOUT");
    const dashboardRoutes = readFileSync(join(here, "../src/modules/dashboard/routes.ts"), "utf8");
    const auditService = readFileSync(join(here, "../src/modules/audit/service.ts"), "utf8");
    assert.equal(dashboardRoutes.includes("auditLog.delete"), false);
    assert.equal(/deleteMany\(\s*\{\s*[\s\S]*auditLog/i.test(auditService), false);
    assert.match(dashboardRoutes, /requirePermission\("audit.read"\)/);
  });

  it("rejects illegal operational-alert transitions", () => {
    assert.equal(canAcknowledgeAlert("RESOLVED").ok, false);
    assert.equal(canResolveAlert("RESOLVED").ok, false);
    assert.equal(canAcknowledgeAlert("OPEN").ok, true);
  });
});

describe("input validation, headers, and secrets", () => {
  it("rejects unsafe route identifiers", () => {
    assert.equal(isSafeRouteId("clxyz0123456789abcd"), true);
    assert.equal(isSafeRouteId(""), false);
    assert.equal(isSafeRouteId("../secrets"), false);
    assert.equal(isSafeRouteId("id/../../etc"), false);
    assert.throws(() => routeParam("..\\windows"), (error: unknown) => {
      return error instanceof HttpError && error.status === 400;
    });
  });

  it("sets security headers and a request id", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.ok(response.headers.get("x-request-id"));
      assert.equal(response.headers.get("x-powered-by"), null);
    });
  });

  it("does not leak stack traces on unknown routes", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/this-route-does-not-exist`);
      const body = (await response.json()) as { error?: string; stack?: string };
      assert.equal(response.status, 404);
      assert.equal(body.error, "Not found");
      assert.equal(body.stack, undefined);
    });
  });

  it("redacts secrets from structured logs and enforces production JWT/CORS rules", () => {
    const redacted = redactValue({
      password: "demo-password",
      token: "eyJhbGciOiJIUzI1NiJ9.e30.sig",
      userId: "user_1",
    }) as Record<string, unknown>;
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.token, "[redacted]");
    assert.equal(redacted.userId, "user_1");

    assert.equal(jwtSecretIssue("", true), "JWT_SECRET is required");
    assert.equal(jwtSecretIssue("replace-with-a-long-random-string", true) !== null, true);
    assert.equal(jwtSecretIssue("a".repeat(32), true), null);
    assert.equal(corsProductionIssue(["*"], true) !== null, true);
    assert.equal(isCorsOriginAllowed("http://localhost:5173", parseCorsOrigins("http://localhost:5173")), true);
    assert.equal(isCorsOriginAllowed("https://evil.example", parseCorsOrigins("http://localhost:5173")), false);
  });
});
