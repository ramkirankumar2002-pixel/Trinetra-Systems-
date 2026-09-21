import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createConnectivityMachine,
  deriveComponentStatuses,
  observeConnectivity,
} from "../src/domain/connectivityState.js";
import { compareSyncOrder, priorityForEventType } from "../src/domain/eventPriority.js";
import { requiredDependencies, resolveDependencies } from "../src/domain/eventDependencies.js";
import { MAX_SYNC_EVENT_AGE_MS, parseEdgeEventEnvelope } from "../src/domain/edgeEnvelope.js";
import { isSuccessfulAck } from "../src/domain/edgeQueue.js";
import { calculateNetWeight } from "../src/domain/netWeight.js";
import {
  evaluateOfflineAction,
  isConfigStale,
  type OfflinePolicyValues,
} from "../src/domain/offlinePolicy.js";
import {
  formatLocalTransactionId,
  isLocalTransactionId,
  normalizeGatewayCodeForLocalId,
} from "../src/domain/offlineTransactionId.js";
import { assessSyncConflict } from "../src/domain/syncConflict.js";
import { expectedDeviceTypeForEvent, isEdgeEventType } from "../src/domain/edgeTypes.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { EVENT_KEYS } from "../src/domain/notificationCatalog.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { HttpError } from "../src/lib/httpError.js";
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
    permissions: ["sync.read", "sync.manage", "gateway.read", "gateway.manage"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function denyStatus(code: string, auth: AuthenticatedUser): number | undefined {
  const middleware = requirePermission(code);
  let captured: HttpError | undefined;
  middleware({ auth } as Request, {} as Response, ((error?: unknown) => {
    if (error instanceof HttpError) {
      captured = error;
    }
  }) as NextFunction);
  return captured?.status;
}

function policy(nowMs: number): OfflinePolicyValues {
  return {
    version: 1,
    source: "CENTRAL",
    timestamp: new Date(nowMs).toISOString(),
    validUntil: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    allowWeightRead: true,
    allowAnpr: true,
    allowDocumentCapture: true,
    allowBasicTransactionRecording: true,
    allowWeightAnomalyDetection: true,
    transactionCompletion: "CONDITIONAL",
    materialVerification: "CONDITIONAL",
    approvals: "BLOCKED",
    configChanges: "BLOCKED",
    userManagement: "BLOCKED",
    hardwareConfigChanges: "BLOCKED",
    maxConfigAgeHours: 24,
  };
}

describe("offline-first synchronization", () => {
  it("does not flip ONLINE to OFFLINE on a single failed request", () => {
    let machine = createConnectivityMachine("ONLINE");
    machine = observeConnectivity(machine, {
      internetOnline: false,
      backendReachable: false,
      hardwareOnline: true,
      authenticating: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 1,
      openConflicts: 0,
    });
    assert.equal(machine.state, "DEGRADED");
    machine = observeConnectivity(machine, {
      internetOnline: false,
      backendReachable: false,
      hardwareOnline: true,
      authenticating: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 1,
      openConflicts: 0,
    });
    assert.equal(machine.state, "DEGRADED");
    machine = observeConnectivity(machine, {
      internetOnline: false,
      backendReachable: false,
      hardwareOnline: true,
      authenticating: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 1,
      openConflicts: 0,
    });
    assert.equal(machine.state, "OFFLINE");
  });

  it("keeps internet, backend, hardware, and sync as separate statuses", () => {
    const statuses = deriveComponentStatuses({
      internetOnline: true,
      backendReachable: true,
      hardwareOnline: false,
      authenticating: false,
      authFailed: false,
      syncing: true,
      pendingCritical: 0,
      openConflicts: 0,
    });
    assert.equal(statuses.internet, "ONLINE");
    assert.equal(statuses.backend, "REACHABLE");
    assert.equal(statuses.hardware, "OFFLINE");
    assert.equal(statuses.sync, "SYNCING");
  });

  it("requires two healthy observations before leaving recovery", () => {
    let machine = createConnectivityMachine("OFFLINE");
    machine = observeConnectivity(machine, {
      internetOnline: true,
      backendReachable: true,
      hardwareOnline: true,
      authenticating: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 0,
      openConflicts: 0,
    });
    assert.equal(machine.state, "RECOVERING");
    machine = observeConnectivity(machine, {
      internetOnline: true,
      backendReachable: true,
      hardwareOnline: true,
      authenticating: false,
      authFailed: false,
      syncing: false,
      pendingCritical: 0,
      openConflicts: 0,
    });
    assert.equal(machine.state, "ONLINE");
  });

  it("synchronizes critical business events before telemetry", () => {
    assert.equal(priorityForEventType("DEVICE_WEIGHT_READING"), "CRITICAL");
    assert.equal(priorityForEventType("DEVICE_ANPR_DETECTION"), "HIGH");
    assert.equal(priorityForEventType("DEVICE_STATUS_CHANGED"), "NORMAL");
    const ordered = [
      { priority: "LOW" as const, eventTimestamp: "2026-09-20T10:00:02.000Z", receivedAt: "2026-09-20T10:00:02.000Z" },
      { priority: "CRITICAL" as const, eventTimestamp: "2026-09-20T10:00:05.000Z", receivedAt: "2026-09-20T10:00:05.000Z" },
      { priority: "HIGH" as const, eventTimestamp: "2026-09-20T10:00:01.000Z", receivedAt: "2026-09-20T10:00:01.000Z" },
    ].sort(compareSyncOrder);
    assert.equal(ordered[0]?.priority, "CRITICAL");
    assert.equal(ordered[1]?.priority, "HIGH");
  });

  it("keeps dependent events pending instead of discarding them", () => {
    const created = "EVT-CREATE-0001";
    const dep = resolveDependencies(
      {
        eventId: "EVT-GROSS-0001",
        eventType: "DEVICE_WEIGHT_READING",
        localTransactionId: "EDGE01-20260920-000001",
        dependsOn: requiredDependencies({ eventType: "DEVICE_WEIGHT_READING", dependsOn: [created] }),
      },
      new Set(),
    );
    assert.equal(dep.ready, false);
    assert.deepEqual(dep.missing, [created]);
    assert.equal(resolveDependencies({ eventId: "x", eventType: "DEVICE_WEIGHT_READING", localTransactionId: null, dependsOn: [created] }, new Set([created])).ready, true);
  });

  it("issues collision-resistant offline transaction ids", () => {
    const first = formatLocalTransactionId({ gatewayCode: "TRINETRA-EDGE-01", dayUtc: "2026-09-20", sequence: 123 });
    const second = formatLocalTransactionId({ gatewayCode: "EDGE-02", dayUtc: "2026-09-20", sequence: 123 });
    assert.equal(first, "TRINETRAEDGE01-20260920-000123");
    assert.equal(isLocalTransactionId(first), true);
    assert.notEqual(first, second);
    assert.equal(normalizeGatewayCodeForLocalId("edge-01"), "EDGE01");
  });

  it("blocks offline approvals and stale configuration", () => {
    const now = Date.parse("2026-09-20T10:00:00.000Z");
    const current = policy(now);
    assert.equal(evaluateOfflineAction(current, "APPROVAL", { nowMs: now }).allowed, false);
    assert.equal(evaluateOfflineAction(current, "READ_WEIGHT", { nowMs: now }).allowed, true);
    assert.equal(
      evaluateOfflineAction(current, "TRANSACTION_COMPLETION", { nowMs: now, approvalRequired: true }).allowed,
      false,
    );
    assert.equal(
      evaluateOfflineAction(current, "TRANSACTION_COMPLETION", { nowMs: now, approvalRequired: false }).allowed,
      true,
    );
    const stale = { ...current, validUntil: new Date(now - 1000).toISOString() };
    assert.equal(isConfigStale(stale, now), true);
    assert.equal(evaluateOfflineAction(stale, "BASIC_TRANSACTION", { nowMs: now }).reason, "Configuration refresh required.");
  });

  it("detects completion conflicts without choosing a winner", () => {
    const conflict = assessSyncConflict({ localState: "LOCAL_COMPLETED", centralStatus: "REJECTED" });
    assert.equal(conflict.conflict, true);
    assert.match(conflict.reason ?? "", /REJECTED/);
    assert.match(conflict.recommendedAction ?? "", /Do not overwrite/);
    assert.equal(assessSyncConflict({ localState: "GROSS_CAPTURED", centralStatus: "IDENTIFIED" }).conflict, false);
  });

  it("treats ACCEPTED and ALREADY_PROCESSED as the same business outcome", () => {
    assert.equal(isSuccessfulAck("ACCEPTED"), true);
    assert.equal(isSuccessfulAck("ALREADY_PROCESSED"), true);
    assert.equal(isSuccessfulAck("CONFLICT"), false);
  });

  it("keeps official net-weight precision from Step 9", () => {
    const net = calculateNetWeight("24580.250", "8420.125");
    assert.equal(net.netAsDecimal, "16160.125");
    assert.equal(net.tareExceedsGross, false);
    assert.equal(calculateNetWeight("1000.000", "1000.001").tareExceedsGross, true);
  });

  it("accepts new local event types on any device class and extends replay window for sync", () => {
    assert.equal(isEdgeEventType("LOCAL_TRANSACTION_CREATED"), true);
    assert.ok(expectedDeviceTypeForEvent("LOCAL_WEIGHT_ANOMALY").includes("WEIGHBRIDGE_INDICATOR"));
    const now = Date.parse("2026-09-20T10:00:00.000Z");
    const old = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const envelope = {
      eventId: "EVENT-OLD-0001",
      gatewayId: "gw_1",
      deviceId: "dev_1",
      deviceType: "WEIGHBRIDGE_INDICATOR",
      eventType: "LOCAL_TRANSACTION_CREATED",
      timestamp: old,
      gatewayReceiveTime: old,
      softwareVersion: "0.17.0",
      payload: { localTransactionId: "EDGE01-20260910-000001" },
    };
    assert.equal(typeof parseEdgeEventEnvelope(envelope, now), "string");
    assert.equal(typeof parseEdgeEventEnvelope(envelope, now, { maxAgeMs: MAX_SYNC_EVENT_AGE_MS }), "object");
  });

  it("keeps sync inspection behind RBAC and site isolation", () => {
    const operator = user({
      permissions: ["weighbridge.read"],
      roles: [{ id: "role_wb", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    });
    assert.equal(denyStatus("sync.manage", operator), 403);
    assert.equal(denyStatus("sync.read", user()), undefined);
    assert.equal(canAccessSite(operator, "site_b"), false);
    assert.equal(AUDIT_ACTIONS.EDGE_SYNC_CONFLICT_DETECTED, "EDGE_SYNC_CONFLICT_DETECTED");
    assert.equal(EVENT_KEYS.syncConflict("c1"), "sync.conflict:c1");
  });
});
