import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { formatReferenceId } from "../src/domain/observability/correlation.js";
import { categoryFromHttpStatus, categoryFromPrismaCode } from "../src/domain/observability/errorCategory.js";
import { overlayGatewayMonitorStatus } from "../src/domain/observability/gatewayMonitor.js";
import { communicationFromHardwareStatus } from "../src/domain/observability/deviceMonitor.js";
import { classifyProviderMonitorStatus } from "../src/domain/observability/providerMonitor.js";
import { apiErrorRateExceeded } from "../src/domain/observability/thresholds.js";
import { incidentTitle } from "../src/domain/observability/incidents.js";
import { EVENT_KEYS } from "../src/domain/notificationCatalog.js";
import { redactValue, writeLog } from "../src/lib/logger.js";
import { InMemoryMetricsRegistry, metrics, recordApiRequest } from "../src/lib/metrics.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { HttpError } from "../src/lib/httpError.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

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
    permissions: ["monitoring.read", "reliability.read", "dashboard.read"],
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

describe("correlation IDs", () => {
  it("reuses the request ID as the correlation ID and public reference", async () => {
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health/live`, {
        headers: { "x-request-id": "trace-live-01" },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-request-id"), "trace-live-01");
      assert.equal(response.headers.get("x-correlation-id"), "trace-live-01");
      assert.equal(response.headers.get("x-reference-id"), formatReferenceId("trace-live-01"));
    });
    assert.equal(formatReferenceId("a1b2c3d4-e5f6-7890"), "REQ-A1B2C3D4");
    assert.notEqual(formatReferenceId("a1b2c3d4-e5f6-7890").startsWith("TRN-"), true);
  });
});

describe("health checks", () => {
  it("keeps liveness separate from readiness and omits secrets", async () => {
    await withApp(async (baseUrl) => {
      const live = await fetch(`${baseUrl}/health/live`);
      const ready = await fetch(`${baseUrl}/health/ready`);
      const readyText = await ready.text();
      assert.equal(live.status, 200);
      assert.equal(readyText.toLowerCase().includes("postgresql://"), false);
      assert.equal(readyText.includes("PASSWORD"), false);
      assert.ok(ready.status === 200 || ready.status === 503);
    });
  });
});

describe("metrics collection", () => {
  it("records request counts without storing bodies and exposes a Prometheus text extension point", () => {
    const registry = new InMemoryMetricsRegistry();
    registry.increment("api_requests_total", "HTTP requests", { method: "GET", route: "/x", status: "200" });
    registry.observe("api_request_duration_ms", "duration", 12, { method: "GET", route: "/x" });
    const snapshot = registry.snapshot();
    assert.equal(snapshot.storage, "memory");
    assert.match(snapshot.limitation, /not sufficient for production/);
    assert.equal(snapshot.counters[0]?.value, 1);
    const text = registry.toPrometheusText();
    assert.match(text, /TYPE api_requests_total counter/);
    assert.equal(text.includes("password"), false);
    registry.reset();
    assert.equal(registry.snapshot().counters.length, 0);
  });

  it("computes API error rate only after enough samples", () => {
    assert.equal(apiErrorRateExceeded({ requests: 5, errors: 5, minSampleSize: 20, threshold: 0.2 }), false);
    assert.equal(apiErrorRateExceeded({ requests: 100, errors: 25, minSampleSize: 20, threshold: 0.2 }), true);
    metrics.reset();
    recordApiRequest({ method: "GET", route: "/api/v1/x", status: 500, durationMs: 10 });
    const window = metrics.windowErrorRate();
    assert.equal(window.errors, 1);
  });
});

describe("error categorization", () => {
  it("maps HTTP and Prisma failures to stable categories", () => {
    assert.equal(categoryFromHttpStatus(401), "AUTHENTICATION_ERROR");
    assert.equal(categoryFromHttpStatus(403), "AUTHORIZATION_ERROR");
    assert.equal(categoryFromHttpStatus(400), "VALIDATION_ERROR");
    assert.equal(categoryFromHttpStatus(500), "SYSTEM_ERROR");
    assert.equal(categoryFromPrismaCode("P1001"), "DATABASE_ERROR");
    assert.equal(categoryFromPrismaCode("P2002"), "VALIDATION_ERROR");
    assert.equal(new HttpError(403, "denied").category, "AUTHORIZATION_ERROR");
  });
});

describe("gateway, device, and provider status", () => {
  it("overlays STALE without replacing the existing runtime derivation", () => {
    assert.equal(
      overlayGatewayMonitorStatus({
        runtime: "ONLINE",
        liveness: "STALE",
        lastError: null,
        unhealthyDeviceCount: 0,
      }),
      "STALE",
    );
    assert.equal(
      overlayGatewayMonitorStatus({
        runtime: "ONLINE",
        liveness: "ONLINE",
        lastError: "timeout",
        unhealthyDeviceCount: 0,
      }),
      "DEGRADED",
    );
    assert.equal(
      overlayGatewayMonitorStatus({
        runtime: "REVOKED",
        liveness: "DISABLED",
        lastError: null,
        unhealthyDeviceCount: 0,
      }),
      "ERROR",
    );
  });

  it("reports communication state instead of device health", () => {
    assert.equal(communicationFromHardwareStatus("CONNECTED", true), "ONLINE");
    assert.equal(communicationFromHardwareStatus("ERROR", true), "ERROR");
    assert.equal(communicationFromHardwareStatus("CONNECTED", false), "DISABLED");
  });

  it("labels simulated providers as SIMULATION", () => {
    assert.equal(
      classifyProviderMonitorStatus({ configured: true, reachable: true, simulation: true }),
      "SIMULATION",
    );
    assert.equal(
      classifyProviderMonitorStatus({ configured: true, reachable: false, simulation: false }),
      "UNAVAILABLE",
    );
  });
});

describe("alert deduplication and incident titles", () => {
  it("reuses day-bucket event keys so the same unresolved condition is not a new alert", () => {
    assert.equal(EVENT_KEYS.systemDegraded("api", "2026-09-21"), "system.degraded:api:2026-09-21");
    assert.equal(EVENT_KEYS.systemDegraded("api", "2026-09-21"), EVENT_KEYS.systemDegraded("api", "2026-09-21"));
    assert.equal(incidentTitle("SYSTEM_DEGRADED", "system.degraded:postgresql:2026-09-21"), "Database Unavailable");
    assert.equal(incidentTitle("SYSTEM_DEGRADED", "system.degraded:weighbridge:2026-09-21"), "Weight Provider Unavailable");
    assert.equal(incidentTitle("WEIGHT_ANOMALY", "weight.anomaly:1"), "Weight anomaly");
    assert.notEqual(incidentTitle("WEIGHT_ANOMALY", "weight.anomaly:1").toLowerCase().includes("fraud"), true);
  });
});

describe("monitoring authorization", () => {
  it("requires monitoring.read and denies drivers", () => {
    assert.equal(denyStatus("monitoring.read", user()), undefined);
    assert.equal(
      denyStatus("monitoring.read", user({ permissions: ["driver.mode", "weighment.record"], roles: [{ id: "r", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: null }] })),
      403,
    );
  });

  it("rejects unauthenticated monitoring APIs", async () => {
    await withApp(async (baseUrl) => {
      const status = await fetch(`${baseUrl}/api/v1/monitoring/status`);
      assert.equal(status.status, 401);
      const body = await status.json() as { error: string; requestId?: string; correlationId?: string };
      assert.equal(body.error.includes("password"), false);
      assert.ok(body.requestId);
      assert.equal(body.correlationId, body.requestId);
    });
  });
});

describe("user-facing failures", () => {
  it("returns a generic 500 with a searchable reference, not internal secrets", async () => {
    await withApp(async (baseUrl) => {
      const missing = await fetch(`${baseUrl}/api/v1/this-route-does-not-exist`);
      const payload = await missing.json() as { error: string; referenceId?: string };
      assert.equal(missing.status, 404);
      assert.ok(payload.referenceId?.startsWith("REQ-"));
      assert.equal(JSON.stringify(payload).includes("jwtSecret"), false);
    });
  });
});

describe("log redaction", () => {
  it("never writes secrets into structured logs", () => {
    const redacted = redactValue({
      password: "demo-password",
      token: "abc",
      jwt: "eyJhbGciOiJIUzI1NiJ9.e30.sig",
      userId: "user_1",
    }) as Record<string, unknown>;
    assert.equal(redacted.password, "[redacted]");
    assert.equal(redacted.token, "[redacted]");
    assert.equal(redacted.jwt, "[redacted]");
    assert.equal(redacted.userId, "user_1");
    const lines: string[] = [];
    const original = console.error;
    console.error = (line: string) => {
      lines.push(String(line));
    };
    try {
      writeLog("error", "test_event", { password: "secret", correlationId: "cid-1" });
    } finally {
      console.error = original;
    }
    assert.equal(lines[0]?.includes("secret"), false);
    assert.equal(lines[0]?.includes("cid-1"), true);
  });
});
