import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEVELOPMENT_DEFAULT_ANOMALY_CONFIG } from "../src/domain/weightAnomaly/config.js";
import { evaluateWeightAnomaly, sampleFromWeight } from "../src/domain/weightAnomaly/engine.js";
import { derivePlatformState } from "../src/domain/weightAnomaly/platformState.js";
import { scenarioReadings } from "../src/domain/weightAnomaly/scenarios.js";
import type { AnomalySample, WeightAnomalyConfigValues } from "../src/domain/weightAnomaly/types.js";
import { EVENT_KEYS, getNotificationDefinition, notificationHref } from "../src/domain/notificationCatalog.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

const config: WeightAnomalyConfigValues = {
  ...DEVELOPMENT_DEFAULT_ANOMALY_CONFIG,
  consecutiveAnomalyCount: 2,
  minAnomalyDurationMs: 400,
  maxInstabilityDurationMs: 1000,
};

function samples(weights: Array<{ kg: number | null; quality?: AnomalySample["quality"]; at?: number }>): AnomalySample[] {
  return weights.map((item, index) =>
    sampleFromWeight({
      timestampMs: item.at ?? index * 400,
      weightKg: item.kg,
      quality: item.quality ?? "STABLE",
    }),
  );
}

function run(sequence: AnomalySample[], platformState: "EMPTY" | "WEIGHING" | "MAINTENANCE" = "EMPTY") {
  let history: AnomalySample[] = [];
  let candidates = undefined as ReturnType<typeof evaluateWeightAnomaly>["candidates"] | undefined;
  const confirmed: string[] = [];
  const recovered: string[] = [];
  for (const sample of sequence) {
    const result = evaluateWeightAnomaly({
      sample,
      history,
      platformState,
      config,
      ...(candidates ? { candidates } : {}),
    });
    history = result.window;
    candidates = result.candidates;
    for (const hit of result.confirmedHits) {
      confirmed.push(hit.type);
    }
    recovered.push(...result.recoveredTypes);
  }
  return { confirmed, lastRecovered: recovered };
}

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_1",
    fullName: "Operator",
    email: "wb@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_wb", code: "WEIGHBRIDGE", name: "Weighbridge" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role_wb", code: "WEIGHBRIDGE_OPERATOR", name: "Weighbridge Operator", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions: ["anomaly.read", "anomaly.acknowledge", "weighbridge.read"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function denyStatus(permission: string, actor: AuthenticatedUser): number | undefined {
  const middleware = requirePermission(permission);
  const request = { auth: actor } as Request;
  let status: number | undefined;
  middleware(request, {} as Response, ((error: unknown) => {
    if (error instanceof HttpError) {
      status = error.status;
    }
  }) as NextFunction);
  return status;
}

describe("weight anomaly engine", () => {
  it("does not flag normal empty-platform drift inside the DEVELOPMENT DEFAULT threshold", () => {
    const normal = run(samples([{ kg: 0 }, { kg: 2 }, { kg: 4 }, { kg: 3 }]));
    const drift = run(samples([{ kg: 2 }, { kg: 4 }, { kg: 6 }, { kg: 5 }]));
    assert.deepEqual(normal.confirmed, []);
    assert.deepEqual(drift.confirmed, []);
  });

  it("detects empty-platform weight only when platform state is EMPTY", () => {
    const empty = run(samples([{ kg: 3 }, { kg: 4 }, { kg: 850 }, { kg: 860 }]), "EMPTY");
    const weighing = run(samples([{ kg: 3 }, { kg: 4 }, { kg: 850 }, { kg: 860 }]), "WEIGHING");
    assert.equal(empty.confirmed.includes("EMPTY_PLATFORM_WEIGHT"), true);
    assert.equal(weighing.confirmed.includes("EMPTY_PLATFORM_WEIGHT"), false);
  });

  it("detects a weight jump between consecutive valid readings", () => {
    const result = run(samples([{ kg: 12500 }, { kg: 12510 }, { kg: 18000 }]), "WEIGHING");
    assert.equal(result.confirmed.includes("WEIGHT_JUMP"), true);
  });

  it("detects repeated instability after the configured duration", () => {
    const result = run(
      samples([
        { kg: 12500, quality: "STABLE" },
        { kg: 12540, quality: "UNSTABLE" },
        { kg: 12610, quality: "UNSTABLE" },
        { kg: 12480, quality: "UNSTABLE" },
        { kg: 12720, quality: "UNSTABLE" },
        { kg: 12390, quality: "UNSTABLE" },
      ]),
      "WEIGHING",
    );
    assert.equal(result.confirmed.includes("REPEATED_INSTABILITY"), true);
  });

  it("detects negative and invalid weights as measurement anomalies", () => {
    const negative = run(samples([{ kg: -500 }]));
    const invalid = run(samples([{ kg: 0, quality: "INVALID" }]));
    assert.equal(negative.confirmed.includes("NEGATIVE_OR_INVALID_WEIGHT"), true);
    assert.equal(invalid.confirmed.includes("NEGATIVE_OR_INVALID_WEIGHT"), true);
  });

  it("recovers when empty-platform weight returns to the configured band", () => {
    const sequence = samples([{ kg: 850 }, { kg: 860 }, { kg: 4 }, { kg: 3 }]);
    let history: AnomalySample[] = [];
    let candidates = undefined as ReturnType<typeof evaluateWeightAnomaly>["candidates"] | undefined;
    let recovered = false;
    let confirmed = false;
    for (const sample of sequence) {
      const result = evaluateWeightAnomaly({
        sample,
        history,
        platformState: "EMPTY",
        config,
        ...(candidates ? { candidates } : {}),
      });
      history = result.window;
      candidates = result.candidates;
      if (result.confirmedHits.some((hit) => hit.type === "EMPTY_PLATFORM_WEIGHT")) {
        confirmed = true;
      }
      if (confirmed && result.recoveredTypes.includes("EMPTY_PLATFORM_WEIGHT")) {
        recovered = true;
      }
    }
    assert.equal(confirmed, true);
    assert.equal(recovered, true);
  });

  it("uses explicit platform state instead of inferring empty from low weight", () => {
    assert.equal(derivePlatformState({ hasActiveMaintenance: true, openTransactionStatus: null }), "MAINTENANCE");
    assert.equal(derivePlatformState({ hasActiveMaintenance: false, openTransactionStatus: null }), "EMPTY");
    assert.equal(derivePlatformState({ hasActiveMaintenance: false, openTransactionStatus: "FIRST_WEIGHMENT" }), "WEIGHING");
    assert.equal(derivePlatformState({ hasActiveMaintenance: false, openTransactionStatus: "UNLOADING" }), "UNLOADING");
  });

  it("keeps scenario sequences available for the simulator", () => {
    assert.equal(scenarioReadings("NORMAL_EMPTY").length, 4);
    assert.equal(scenarioReadings("EMPTY_ANOMALY")[2]?.weightKg, 850);
    assert.equal(scenarioReadings("NEGATIVE")[0]?.weightKg, -500);
  });
});

describe("weight anomaly authorization and catalog", () => {
  it("blocks operators from configuring thresholds and resolving events", () => {
    const operator = user();
    assert.equal(denyStatus("anomaly.configure", operator), 403);
    assert.equal(denyStatus("anomaly.resolve", operator), 403);
    assert.equal(denyStatus("anomaly.read", operator), undefined);
    assert.equal(denyStatus("anomaly.acknowledge", operator), undefined);
  });

  it("allows management to configure and resolve", () => {
    const manager = user({
      roles: [{ id: "role_off", code: "OFFICE_MANAGER", name: "Office", site: null }],
      permissions: ["anomaly.read", "anomaly.acknowledge", "anomaly.resolve", "anomaly.configure"],
    });
    assert.equal(denyStatus("anomaly.configure", manager), undefined);
    assert.equal(denyStatus("anomaly.resolve", manager), undefined);
  });

  it("routes notifications to the anomaly history and records audit actions", () => {
    assert.equal(getNotificationDefinition("WEIGHT_ANOMALY").createAlert, true);
    assert.equal(EVENT_KEYS.weightAnomaly("evt_1"), "weight.anomaly:evt_1");
    assert.equal(
      notificationHref({
        type: "WEIGHT_ANOMALY",
        approvalId: null,
        transactionId: null,
        entityType: "WeightAnomalyEvent",
        entityId: "evt_1",
      }),
      "/weighbridge/anomalies/evt_1",
    );
    assert.equal(AUDIT_ACTIONS.WEIGHT_ANOMALY_DETECTED, "WEIGHT_ANOMALY_DETECTED");
    assert.equal(AUDIT_ACTIONS.WEIGHT_ANOMALY_FALSE_POSITIVE, "WEIGHT_ANOMALY_FALSE_POSITIVE");
    assert.equal(AUDIT_ACTIONS.WEIGHT_ANOMALY_CONFIG_CHANGED, "WEIGHT_ANOMALY_CONFIG_CHANGED");
    assert.equal(AUDIT_ACTIONS.MAINTENANCE_STARTED, "MAINTENANCE_STARTED");
  });
});
