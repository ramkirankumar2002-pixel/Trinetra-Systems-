import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateGatewayCredential, hashGatewayCredential, isGatewayCredentialFormat } from "../src/domain/edgeCredentials.js";
import {
  organizationClaimMismatch,
  parseEdgeEventEnvelope,
  siteClaimMismatch,
} from "../src/domain/edgeEnvelope.js";
import { deriveGatewayRuntimeStatus, isGatewayAcceptingEvents } from "../src/domain/edgeGatewayStatus.js";
import { decideRetry, nextRetryDelayMs } from "../src/domain/edgeRetry.js";
import { rejectSecretFields, stripSecretFields } from "../src/domain/edgeSecrets.js";
import { expectedDeviceTypeForEvent, isEdgeEventType } from "../src/domain/edgeTypes.js";
import { EVENT_KEYS } from "../src/domain/notificationCatalog.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_1",
    fullName: "Supervisor",
    email: "supervisor@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep", code: "SUPERVISOR", name: "Supervisor" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role", code: "SUPERVISOR", name: "Supervisor", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions: ["gateway.read", "gateway.manage", "weighbridge.manage"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function callPermission(code: string, auth: AuthenticatedUser): HttpError | undefined {
  const middleware = requirePermission(code);
  let captured: HttpError | undefined;
  middleware({ auth } as Request, {} as Response, ((error?: unknown) => {
    if (error instanceof HttpError) {
      captured = error;
    }
  }) as NextFunction);
  return captured;
}

function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "EVENT-12345678",
    gatewayId: "gw_1",
    deviceId: "dev_1",
    deviceType: "WEIGHBRIDGE_INDICATOR",
    eventType: "DEVICE_WEIGHT_READING",
    timestamp: "2026-09-20T10:00:00.000Z",
    gatewayReceiveTime: "2026-09-20T10:00:00.200Z",
    softwareVersion: "0.14.0",
    payload: { weightKg: 24580, unit: "KG", quality: "STABLE", connectionStatus: "CONNECTED", source: "SIMULATED" },
    ...overrides,
  };
}

describe("edge gateway domain", () => {
  it("issues hashed gateway credentials that are not user passwords", () => {
    const credential = generateGatewayCredential();
    assert.equal(isGatewayCredentialFormat(credential), true);
    assert.notEqual(hashGatewayCredential(credential), credential);
    assert.equal(hashGatewayCredential(credential), hashGatewayCredential(credential));
  });

  it("marks a gateway offline only after the heartbeat timeout", () => {
    const now = Date.parse("2026-09-20T10:01:00.000Z");
    assert.equal(
      deriveGatewayRuntimeStatus({
        enabled: true,
        revokedAt: null,
        lastHeartbeatAt: new Date("2026-09-20T10:00:50.000Z"),
        nowMs: now,
        offlineTimeoutMs: 45_000,
      }),
      "ONLINE",
    );
    assert.equal(
      deriveGatewayRuntimeStatus({
        enabled: true,
        revokedAt: null,
        lastHeartbeatAt: new Date("2026-09-20T10:00:00.000Z"),
        nowMs: now,
        offlineTimeoutMs: 45_000,
      }),
      "OFFLINE",
    );
    assert.equal(
      deriveGatewayRuntimeStatus({
        enabled: false,
        revokedAt: null,
        lastHeartbeatAt: new Date("2026-09-20T10:00:50.000Z"),
        nowMs: now,
        offlineTimeoutMs: 45_000,
      }),
      "DISABLED",
    );
    assert.equal(isGatewayAcceptingEvents("REVOKED"), false);
  });

  it("validates event envelopes and ignores spoofed org/site claims", () => {
    const now = Date.parse("2026-09-20T10:00:01.000Z");
    const parsed = parseEdgeEventEnvelope(validEnvelope(), now);
    assert.equal(typeof parsed === "object", true);
    assert.equal(parseEdgeEventEnvelope({ ...validEnvelope(), eventType: "UNKNOWN" }, now), "Unsupported event type");
    assert.equal(
      parseEdgeEventEnvelope({ ...validEnvelope(), payload: { password: "x" } }, now),
      "Device configuration cannot include secrets. Store credentials on the server only.",
    );
    assert.equal(organizationClaimMismatch("other-org", "org"), "Event organization does not match the registered gateway");
    assert.equal(siteClaimMismatch("site_b", "site_a"), "Event site does not match the registered gateway");
    assert.equal(organizationClaimMismatch(undefined, "org"), null);
  });

  it("routes event types to matching device types", () => {
    assert.equal(isEdgeEventType("DEVICE_ANPR_DETECTION"), true);
    assert.deepEqual(expectedDeviceTypeForEvent("DEVICE_WEIGHT_READING"), ["WEIGHBRIDGE_INDICATOR"]);
    assert.deepEqual(expectedDeviceTypeForEvent("DEVICE_ANPR_DETECTION"), ["CAMERA"]);
  });

  it("backs off retries instead of looping forever", () => {
    assert.equal(nextRetryDelayMs(0), 1000);
    assert.equal(nextRetryDelayMs(3), 8000);
    assert.equal(decideRetry({ retryCount: 8, maxRetries: 8 }).shouldRetry, false);
    assert.equal(decideRetry({ retryCount: 2, maxRetries: 8 }).shouldRetry, true);
  });

  it("strips secrets from public device configuration", () => {
    assert.equal(rejectSecretFields({ apiKey: "x" }) !== null, true);
    const cleaned = stripSecretFields({ name: "WB-01", token: "secret", nested: { password: "x", unit: "KG" } });
    assert.deepEqual(cleaned, { name: "WB-01", nested: { unit: "KG" } });
  });

  it("isolates gateway management by site and RBAC", () => {
    const operator = user({
      permissions: ["weighbridge.read"],
      roles: [{ id: "role_wb", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    });
    assert.ok(callPermission("gateway.manage", operator) instanceof HttpError);
    assert.equal(callPermission("gateway.manage", user()), undefined);
    assert.equal(canAccessSite(operator, "site_a"), true);
    assert.equal(canAccessSite(operator, "site_b"), false);
    assert.equal(AUDIT_ACTIONS.GATEWAY_REGISTERED, "GATEWAY_REGISTERED");
    assert.equal(EVENT_KEYS.gatewayOffline("gw", "hour"), "gateway.offline:gw:hour");
  });
});
