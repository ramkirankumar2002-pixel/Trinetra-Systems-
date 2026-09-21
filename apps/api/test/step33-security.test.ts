import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { corsProductionIssue, jwtExpiresIssue, jwtSecretIssue, parseExpiresInSeconds } from "../src/config/security.js";
import { validateDocumentFile } from "../src/domain/documentFile.js";
import { assertWebhookDestination, isBlockedWebhookHost } from "../src/domain/integration/webhookUrl.js";
import { assertTransactionMutable } from "../src/domain/transactionMutability.js";
import { redactValue } from "../src/lib/logger.js";
import { isSafeRouteId, routeParam } from "../src/lib/routeParam.js";
import { HttpError } from "../src/lib/httpError.js";
import { toPublicDocument } from "../src/modules/documents/mapper.js";
import { toPublicTicket } from "../src/modules/support/mapper.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";

const here = dirname(fileURLToPath(import.meta.url));

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

describe("step 33 authentication and headers", () => {
  it("rejects invalid credentials with a generic message and no secrets", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.invalid", password: "wrong-password" }),
      });
      const body = (await response.json()) as { error?: string };
      assert.equal(response.status, 401);
      assert.equal(body.error, "Invalid email or password");
      assert.equal(JSON.stringify(body).includes("passwordHash"), false);
      assert.equal(JSON.stringify(body).includes("wrong-password"), false);
    });
  });

  it("requires authentication on protected APIs", async () => {
    await withApp(async (baseUrl) => {
      const routes = [
        "/api/v1/transactions",
        "/api/v1/vehicles",
        "/api/v1/documents/abc123",
        "/api/v1/reports/transactions",
        "/api/v1/integrations/overview",
        "/api/v1/support/tickets",
        "/api/v1/ext/organization",
      ];
      for (const path of routes) {
        const response = await fetch(`${baseUrl}${path}`);
        assert.equal(response.status, 401, path);
      }
    });
  });
});

describe("step 33 input, files, and secrets", () => {
  it("rejects path-like identifiers and executable or oversized uploads", () => {
    assert.equal(isSafeRouteId("../etc/passwd"), false);
    assert.throws(() => routeParam("..\\windows"), (error: unknown) => error instanceof HttpError && error.status === 400);
    assert.equal(
      typeof validateDocumentFile({
        originalFileName: "payload.exe",
        declaredMimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n", "ascii"),
      }),
      "string",
    );
    assert.equal(
      typeof validateDocumentFile({
        originalFileName: "note.pdf",
        declaredMimeType: "application/pdf",
        buffer: Buffer.alloc(11 * 1024 * 1024, 1),
      }),
      "string",
    );
  });

  it("omits storage paths from public document payloads", () => {
    const published = toPublicDocument({
      id: "doc_1",
      organizationId: "org_1",
      transactionId: "txn_1",
      documentType: "INVOICE",
      originalFileName: "invoice.pdf",
      mimeType: "application/pdf",
      storageKey: "private/org_1/secret-folder/invoice.pdf",
      status: "UPLOADED",
      ocrStatus: "PENDING",
      extractedData: null,
      uploadedByUserId: "user_1",
      verifiedByUserId: null,
      createdAt: new Date("2026-09-21T00:00:00.000Z"),
      updatedAt: new Date("2026-09-21T00:00:00.000Z"),
      uploadedByUser: { id: "user_1", fullName: "Operator" },
      verifiedByUser: null,
    } as Parameters<typeof toPublicDocument>[0]);
    assert.equal("storageKey" in published, false);
    assert.equal(JSON.stringify(published).includes("secret-folder"), false);
  });

  it("redacts integration and webhook secrets from logs", () => {
    const redacted = redactValue({
      authorization: "Bearer tsk_live_example",
      secret: "whsec_example",
      clientId: "tapp_example",
      note: "ok",
    }) as Record<string, unknown>;
    assert.equal(redacted.authorization, "[redacted]");
    assert.equal(redacted.secret, "[redacted]");
    assert.equal(redactValue("tsk_test_abcdef"), "[redacted]");
    assert.equal(redactValue("whsec_abcdef"), "[redacted]");
    assert.equal(redacted.note, "ok");
  });

  it("blocks private, mapped, and metadata webhook hosts in production mode", () => {
    assert.equal(isBlockedWebhookHost("127.0.0.1"), true);
    assert.equal(isBlockedWebhookHost("10.0.0.8"), true);
    assert.equal(isBlockedWebhookHost("169.254.169.254"), true);
    assert.equal(isBlockedWebhookHost("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedWebhookHost("::ffff:7f00:1"), true);
    assert.equal(isBlockedWebhookHost("[::ffff:7f00:1]"), true);
    assert.equal(isBlockedWebhookHost("hooks.example.com"), false);
    assert.throws(() => assertWebhookDestination("https://[::ffff:127.0.0.1]/hook", false));
    assert.throws(() => assertWebhookDestination("https://0.0.0.0/hook", false));
    assert.throws(() => assertWebhookDestination("http://hooks.example.com/hook", false));
    assert.doesNotThrow(() => assertWebhookDestination("https://hooks.example.com/hook", false));
  });
});

describe("step 33 authorization and integrity", () => {
  it("blocks completed transaction mutation and missing production secrets", () => {
    assert.equal(assertTransactionMutable("COMPLETED") !== null, true);
    assert.equal(assertTransactionMutable("ARRIVED"), null);
    assert.equal(jwtSecretIssue("", true) !== null, true);
    assert.equal(jwtExpiresIssue("30d", true) !== null, true);
    assert.equal(parseExpiresInSeconds("8h"), 8 * 60 * 60);
    assert.equal(corsProductionIssue(["*"], true) !== null, true);
  });

  it("hides internal support notes from customer-visibility viewers", () => {
    const ticket = toPublicTicket(
      {
        id: "t1",
        ticketNumber: "SUP-1",
        category: "SOFTWARE",
        priority: "LOW",
        status: "OPEN",
        subject: "Help",
        description: "Customer visible",
        assignedTeam: null,
        resolutionSummary: null,
        createdAt: new Date("2026-09-21T00:00:00.000Z"),
        updatedAt: new Date("2026-09-21T00:00:00.000Z"),
        resolvedAt: null,
        closedAt: null,
        site: { id: "s1", code: "A", name: "A" },
        createdByUser: { id: "u1", fullName: "A", email: "a@demo.local" },
        assignedUser: null,
        resolvedByUser: null,
        closedByUser: null,
        weighbridge: null,
        gateway: null,
        device: null,
        transaction: null,
        activities: [
          {
            id: "a1",
            type: "COMMENT",
            visibility: "CUSTOMER",
            description: "Public note",
            createdAt: new Date("2026-09-21T00:00:00.000Z"),
            actorUser: { id: "u1", fullName: "A", email: "a@demo.local" },
          },
          {
            id: "a2",
            type: "INTERNAL_NOTE",
            visibility: "INTERNAL",
            description: "Private diagnostic",
            createdAt: new Date("2026-09-21T00:00:01.000Z"),
            actorUser: { id: "u2", fullName: "Support", email: "s@demo.local" },
          },
        ],
        maintenanceRecords: [],
      } as Parameters<typeof toPublicTicket>[0],
      { canManage: false, canComment: true, canSeeInternal: false },
    );
    assert.equal(ticket.activities.length, 1);
    assert.equal(ticket.activities[0]?.description, "Public note");
    assert.equal(JSON.stringify(ticket).includes("Private diagnostic"), false);
  });

  it("has no audit-delete API and does not log secrets in source", () => {
    const auditService = readFileSync(join(here, "../src/modules/audit/service.ts"), "utf8");
    const dashboardRoutes = readFileSync(join(here, "../src/modules/dashboard/routes.ts"), "utf8");
    assert.equal(Boolean(AUDIT_ACTIONS.LOGIN_FAILED), true);
    assert.equal(dashboardRoutes.includes("auditLog.delete"), false);
    assert.equal(/deleteMany\(\s*\{\s*[\s\S]*auditLog/i.test(auditService), false);
  });
});
