import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { ApprovalDecision, TransactionStatus, UnloadingStatus, WeighmentKind } from "@prisma/client";
import { createApp } from "../src/app.js";
import { env, simulationFlags } from "../src/config/env.js";
import { canTransition } from "../src/domain/transactionState.js";
import { assertTransactionMutable } from "../src/domain/transactionMutability.js";
import {
  EVENT_KEYS,
  NOTIFICATION_DEFINITIONS,
  notificationHref,
} from "../src/domain/notificationCatalog.js";
import {
  applySimulationOverride,
  classifyDependencyHealth,
  overallReadiness,
} from "../src/domain/reliability/health.js";
import { backupsEligibleForDeletion, publicBackupStatus, verifyBackupArtifact } from "../src/domain/reliability/backupPolicy.js";
import { checkAuditConsistency, checkTransactionConsistency } from "../src/domain/reliability/consistency.js";
import { classifyGatewayLiveness, isStaleTransaction } from "../src/domain/reliability/stale.js";
import { toCsv } from "../src/modules/reliability/export.js";
import { resolveDashboardCapabilities } from "../src/domain/dashboardScope.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { HttpError } from "../src/lib/httpError.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";
import { isSuccessfulAck } from "../src/domain/edgeQueue.js";
import { parseEdgeEventEnvelope } from "../src/domain/edgeEnvelope.js";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_admin",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "A", name: "Site A" },
    roles: [{ id: "role", code: "OFFICE_MANAGER", name: "Office", site: null }],
    permissions: ["reliability.read", "reliability.manage", "report.read", "dashboard.read"],
    organizationId: "org",
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

describe("health checks", () => {
  it("separates liveness from readiness and never returns secrets", async () => {
    await withApp(async (baseUrl) => {
      const live = await fetch(`${baseUrl}/health/live`);
      const liveBody = await live.json() as { status: string; service: string };
      assert.equal(live.status, 200);
      assert.equal(liveBody.status, "ok");
      const ready = await fetch(`${baseUrl}/health/ready`);
      const readyText = await ready.text();
      assert.equal(readyText.includes("PASSWORD"), false);
      assert.equal(readyText.toLowerCase().includes("postgresql://"), false);
      assert.ok(ready.status === 200 || ready.status === 503);
      const payload = JSON.parse(readyText) as { status: string; checks: { postgresql?: string } };
      assert.ok(payload.checks.postgresql);
      assert.equal("databaseUrl" in payload, false);
    });
  });

  it("does not treat intentional simulation as a provider failure", () => {
    assert.equal(
      classifyDependencyHealth({ name: "anpr", configured: true, reachable: true, simulation: true }),
      "SIMULATION",
    );
    assert.equal(overallReadiness({ postgresql: "AVAILABLE", anpr: "SIMULATION" }), "ready");
    assert.equal(overallReadiness({ postgresql: "UNAVAILABLE" }), "unavailable");
    assert.equal(applySimulationOverride("AVAILABLE", true), "UNAVAILABLE");
  });
});

describe("backup verification and retention", () => {
  it("does not treat an empty file as success", () => {
    assert.deepEqual(verifyBackupArtifact({ exists: true, sizeBytes: 10, processSucceeded: true }), {
      ok: false,
      errorCode: "BACKUP_FILE_TOO_SMALL",
    });
    assert.deepEqual(verifyBackupArtifact({ exists: true, sizeBytes: 128, processSucceeded: false }), {
      ok: false,
      errorCode: "BACKUP_PROCESS_FAILED",
    });
    assert.equal(verifyBackupArtifact({ exists: true, sizeBytes: 128, processSucceeded: true }).ok, true);
  });

  it("never deletes the only successful backup", () => {
    const now = new Date("2026-09-21T00:00:00.000Z");
    const only = backupsEligibleForDeletion(
      [{ id: "b1", status: "SUCCESS", startedAt: new Date("2026-01-01T00:00:00.000Z"), keep: false }],
      1,
      now,
    );
    assert.deepEqual(only, []);
    const deleted = backupsEligibleForDeletion(
      [
        { id: "new", status: "SUCCESS", startedAt: new Date("2026-09-20T00:00:00.000Z"), keep: false },
        { id: "old", status: "SUCCESS", startedAt: new Date("2026-01-01T00:00:00.000Z"), keep: false },
        { id: "kept", status: "SUCCESS", startedAt: new Date("2026-01-02T00:00:00.000Z"), keep: true },
      ],
      7,
      now,
    );
    assert.deepEqual(deleted, ["old"]);
  });

  it("marks disabled automation as requiring infrastructure, not as a successful dump", () => {
    assert.equal(
      publicBackupStatus({
        enabled: false,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastStatus: null,
        infrastructureAvailable: false,
      }),
      "DISABLED",
    );
    assert.equal(
      publicBackupStatus({
        enabled: true,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastStatus: null,
        infrastructureAvailable: false,
      }),
      "REQUIRES_INFRASTRUCTURE",
    );
  });

  it("keeps a verified dump distinct from a failed partial", () => {
    const verified = verifyBackupArtifact({ exists: true, sizeBytes: 2048, processSucceeded: true });
    const failed = verifyBackupArtifact({ exists: true, sizeBytes: 2048, processSucceeded: false });
    assert.equal(verified.ok, true);
    assert.equal(failed.ok, false);
    assert.equal(failed.ok ? null : failed.errorCode, "BACKUP_PROCESS_FAILED");
  });
});

describe("stale detection and interrupted transactions", () => {
  it("warns on long intermediate states and never auto-completes them", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    assert.equal(
      isStaleTransaction({
        status: TransactionStatus.PENDING_APPROVAL,
        updatedAt: new Date("2026-09-21T01:00:00.000Z"),
        now,
      }),
      true,
    );
    assert.equal(
      isStaleTransaction({
        status: TransactionStatus.COMPLETED,
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
        now,
      }),
      false,
    );
    assert.equal(canTransition(TransactionStatus.FIRST_WEIGHMENT, TransactionStatus.COMPLETED), false);
    assert.equal(assertTransactionMutable(TransactionStatus.FIRST_WEIGHMENT), null);
    assert.equal(canTransition(TransactionStatus.FIRST_WEIGHMENT, TransactionStatus.PENDING_APPROVAL), true);
  });

  it("classifies gateway heartbeat failure without flapping every second", () => {
    const nowMs = Date.parse("2026-09-21T12:00:00.000Z");
    assert.equal(
      classifyGatewayLiveness({
        lastHeartbeatAt: new Date(nowMs - 5_000),
        nowMs,
        staleAfterMs: 20_000,
        offlineAfterMs: 45_000,
        enabled: true,
        revokedAt: null,
      }),
      "ONLINE",
    );
    assert.equal(
      classifyGatewayLiveness({
        lastHeartbeatAt: new Date(nowMs - 30_000),
        nowMs,
        staleAfterMs: 20_000,
        offlineAfterMs: 45_000,
        enabled: true,
        revokedAt: null,
      }),
      "STALE",
    );
    assert.equal(
      classifyGatewayLiveness({
        lastHeartbeatAt: new Date(nowMs - 60_000),
        nowMs,
        staleAfterMs: 20_000,
        offlineAfterMs: 45_000,
        enabled: true,
        revokedAt: null,
      }),
      "OFFLINE",
    );
  });
});

describe("consistency and recovery notifications", () => {
  it("reports weight and audit gaps without fabricating records", () => {
    const findings = checkTransactionConsistency({
      id: "txn_1",
      referenceNumber: "TRN-1",
      status: TransactionStatus.COMPLETED,
      netWeightKg: "10.000",
      weighments: [{ kind: WeighmentKind.GROSS, weightKg: "20.000" }],
      approvals: [],
      unloading: { status: UnloadingStatus.COMPLETED },
    });
    assert.ok(findings.some((item) => item.code === "MISSING_TARE" || item.code === "COMPLETED_INCOMPLETE"));
    const audit = checkAuditConsistency({
      transactionId: "txn_1",
      referenceNumber: "TRN-1",
      status: TransactionStatus.COMPLETED,
      auditActions: ["TRANSACTION_CREATED"],
    });
    assert.ok(audit.some((item) => item.code === "MISSING_AUDIT"));
    assert.ok(audit.every((item) => item.message.includes("not fabricated")));
  });

  it("detects net weight mismatches against the server calculation", () => {
    const findings = checkTransactionConsistency({
      id: "txn_2",
      referenceNumber: "TRN-2",
      status: TransactionStatus.SECOND_WEIGHMENT,
      netWeightKg: "1.000",
      weighments: [
        { kind: WeighmentKind.GROSS, weightKg: "20.000" },
        { kind: WeighmentKind.TARE, weightKg: "8.000" },
      ],
      approvals: [{ decision: ApprovalDecision.APPROVED }],
      unloading: { status: UnloadingStatus.COMPLETED },
    });
    assert.ok(findings.some((item) => item.code === "NET_MISMATCH"));
  });

  it("adds recovery notification types without a second inbox", () => {
    assert.equal(NOTIFICATION_DEFINITIONS.BACKUP_FAILED.createAlert, true);
    assert.equal(NOTIFICATION_DEFINITIONS.STALE_TRANSACTION.createAlert, true);
    assert.equal(EVENT_KEYS.staleTransaction("txn"), "stale.transaction:txn");
    assert.equal(
      notificationHref({ type: "BACKUP_FAILED", approvalId: null, transactionId: null }),
      "/reliability",
    );
    assert.equal(Object.keys(NOTIFICATION_DEFINITIONS).length, 28);
  });
});

describe("authorization, export, and restore boundary", () => {
  it("hides reliability from ordinary operators", () => {
    const operator = user({
      roles: [{ id: "op", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: { id: "site_a", code: "A", name: "A" } }],
      permissions: ["weighment.record", "dashboard.read", "driver.mode"],
    });
    assert.equal(denyStatus("reliability.read", operator), 403);
    assert.equal(resolveDashboardCapabilities(operator).reliability, false);
    assert.equal(resolveDashboardCapabilities(user()).reliability, true);
  });

  it("exports CSV cells safely and does not expose a restore route to anonymous users", async () => {
    assert.equal(toCsv(["a"], [['x,y', 'ok']]) , 'a\n"x,y",ok');
    await withApp(async (baseUrl) => {
      const restore = await fetch(`${baseUrl}/api/v1/reliability/restore`, { method: "POST" });
      assert.ok(restore.status === 401 || restore.status === 404);
      const status = await fetch(`${baseUrl}/api/v1/reliability/status`);
      assert.equal(status.status, 401);
      const body = await restore.text();
      assert.equal(body.toLowerCase().includes("postgresql://"), false);
    });
  });
});

describe("offline duplicate protection and simulation guards", { concurrency: 1 }, () => {
  it("treats a successful ingest ack as already stored", () => {
    assert.equal(isSuccessfulAck("ACCEPTED"), true);
    assert.equal(isSuccessfulAck("ALREADY_PROCESSED"), true);
    assert.equal(isSuccessfulAck("REJECTED"), false);
  });

  it("rejects a corrupted envelope before it becomes a transaction", () => {
    const parsed = parseEdgeEventEnvelope({ eventId: "bad" }, Date.now());
    assert.equal(typeof parsed, "string");
  });

  it("ignores simulation flags in production", () => {
    const previousEnv = env.nodeEnv;
    const previousFlag = env.simulateDatabaseUnavailable;
    env.nodeEnv = "production";
    env.simulateDatabaseUnavailable = true;
    env.simulateEdgeOffline = true;
    env.simulateSyncFailure = true;
    env.simulateProviderUnavailable = true;
    try {
      assert.deepEqual(simulationFlags(), {
        databaseUnavailable: false,
        edgeOffline: false,
        syncFailure: false,
        providerUnavailable: false,
      });
    } finally {
      env.nodeEnv = previousEnv;
      env.simulateDatabaseUnavailable = previousFlag;
      env.simulateEdgeOffline = false;
      env.simulateSyncFailure = false;
      env.simulateProviderUnavailable = false;
    }
  });
});
