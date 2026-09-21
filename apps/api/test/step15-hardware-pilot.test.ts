import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commissioningItemsForDeviceType, isCommissioningTestResult } from "../src/domain/commissioningChecklist.js";
import { correlateHardwareEvent } from "../src/domain/hardwareCorrelation.js";
import { resolveEventTimestamp } from "../src/domain/hardwareClock.js";
import { projectHardwareDiscoveryReport } from "../src/domain/hardwareDiscovery.js";
import { installationStatusRejection } from "../src/domain/hardwareInstallation.js";
import { METROLOGY_NOTICE, rejectWeightOffset } from "../src/domain/metrologyBoundary.js";
import { isOperationMode, operationModeLabel } from "../src/domain/operationMode.js";
import {
  canSubmitHardwareSource,
  HARDWARE_INFORMATION_REQUIRED_MESSAGE,
  resolveAdapterKey,
  resolveProtocolReadiness,
} from "../src/domain/protocolReadiness.js";
import { parseProtocolTestWeight } from "../src/domain/protocolTestHarness.js";
import { serialPortAvailability, validateSerialConfig } from "../src/domain/serialConfig.js";
import { validateTcpConfig } from "../src/domain/tcpConfig.js";
import { officialWeighmentRejection } from "../src/domain/weighmentAcceptance.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";
import { parseModbusMapping } from "../src/domain/modbusMapping.js";

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
    permissions: ["hardware.pilot", "weighbridge.manage", "gateway.manage"],
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

describe("hardware pilot framework", () => {
  it("does not invent a documented manufacturer protocol", () => {
    const report = projectHardwareDiscoveryReport();
    assert.equal(report.realAdaptersFinalized, false);
    assert.equal(report.message, HARDWARE_INFORMATION_REQUIRED_MESSAGE);
    assert.equal(resolveProtocolReadiness({ provider: "SERIAL", manufacturer: "Unknown" }), "PROTOCOL_DETAILS_REQUIRED");
    assert.equal(resolveProtocolReadiness({ requested: "DOCUMENTED" }), "PROTOCOL_DETAILS_REQUIRED");
    assert.equal(canSubmitHardwareSource("PROTOCOL_DETAILS_REQUIRED"), HARDWARE_INFORMATION_REQUIRED_MESSAGE);
    assert.match(parseModbusMapping(null) as string, /manufacturer/i);
  });

  it("classifies simulator, protocol-test, and undeployed adapters", () => {
    assert.equal(resolveAdapterKey({ protocolReadiness: "SIMULATOR", provider: "SIMULATOR" }), "simulator");
    assert.equal(resolveAdapterKey({ protocolReadiness: "PROTOCOL_TEST_ONLY" }), "protocol-test");
    assert.equal(resolveAdapterKey({ protocolReadiness: "PROTOCOL_DETAILS_REQUIRED", provider: "SERIAL" }), "undeployed");
  });

  it("parses recorded protocol-test messages without claiming a manufacturer format", () => {
    const parsed = parseProtocolTestWeight({ raw: "WT 24580 KG", stable: true });
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.testKind, "PROTOCOL_TEST");
      assert.equal(parsed.weightKg, 24580);
      assert.equal(parsed.stable, true);
    }
    const invalid = parseProtocolTestWeight({ raw: "NO WEIGHT" });
    assert.equal(invalid.ok, false);
    const unstable = parseProtocolTestWeight({ raw: "12000", stable: false });
    assert.equal(unstable.ok, true);
    if (unstable.ok) {
      assert.equal(unstable.stable, false);
    }
  });

  it("rejects official weighments that are unstable or have an unrecognized unit", () => {
    const limits = { minKg: "100", maxKg: "80000" };
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "CONNECTED",
        quality: "UNSTABLE",
        weightKg: "24580",
        unit: "KG",
        expectedUnit: "KG",
        limits,
      }),
      "Stable weight reading is not available.",
    );
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "DISCONNECTED",
        quality: "STABLE",
        weightKg: "24580",
        unit: "KG",
        expectedUnit: "KG",
        limits,
      }),
      "Stable weight reading is not available.",
    );
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "CONNECTED",
        quality: "STABLE",
        weightKg: "24580",
        unit: "LB",
        expectedUnit: "KG",
        limits,
      }),
      "Stable weight reading is not available.",
    );
  });

  it("validates serial and tcp configuration without scanning the network", () => {
    assert.equal(
      validateSerialConfig({
        serialPort: "COM3",
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "NONE",
        readTimeoutMs: 1000,
        reconnectIntervalMs: 2000,
      }),
      null,
    );
    assert.match(validateSerialConfig({ serialPort: "not-a-port" }) ?? "", /serial port/i);
    assert.equal(serialPortAvailability("COM9999").available, false);
    assert.equal(serialPortAvailability("COM9999").reason, "DEVICE NOT AVAILABLE");
    assert.equal(
      validateTcpConfig({ host: "10.20.30.40", port: 4001, timeoutMs: 2000, reconnectIntervalMs: 5000 }),
      null,
    );
    assert.match(validateTcpConfig({ host: "0.0.0.0", port: 4001, timeoutMs: 2000, reconnectIntervalMs: 5000 }) ?? "", /explicitly/);
    assert.match(validateTcpConfig({ host: "*", port: 80, timeoutMs: 2000, reconnectIntervalMs: 5000 }) ?? "", /explicitly/);
  });

  it("correlates hardware events by transaction, site, and weighbridge — not time", () => {
    assert.match(
      correlateHardwareEvent({
        transactionId: null,
        requireTransaction: true,
        deviceSiteId: "site_a",
        deviceWeighbridgeId: "wb_1",
        transaction: null,
      }) ?? "",
      /transaction ID/i,
    );
    assert.equal(
      correlateHardwareEvent({
        transactionId: "tx_1",
        requireTransaction: true,
        deviceSiteId: "site_a",
        deviceWeighbridgeId: "wb_1",
        transaction: { id: "tx_1", siteId: "site_a", weighbridgeId: "wb_1" },
      }),
      null,
    );
    assert.match(
      correlateHardwareEvent({
        transactionId: "tx_1",
        requireTransaction: true,
        deviceSiteId: "site_b",
        deviceWeighbridgeId: "wb_1",
        transaction: { id: "tx_1", siteId: "site_a", weighbridgeId: "wb_1" },
      }) ?? "",
      /site/,
    );
    assert.match(
      correlateHardwareEvent({
        transactionId: "tx_1",
        requireTransaction: true,
        deviceSiteId: "site_a",
        deviceWeighbridgeId: "wb_2",
        transaction: { id: "tx_1", siteId: "site_a", weighbridgeId: "wb_1" },
      }) ?? "",
      /weighbridge/,
    );
  });

  it("uses gateway receipt time when the device clock is invalid", () => {
    const now = Date.parse("2026-09-20T10:00:00.000Z");
    const invalid = resolveEventTimestamp({
      deviceEventTime: "not-a-date",
      gatewayReceiveTime: "2026-09-20T10:00:00.200Z",
      nowMs: now,
    });
    assert.equal(invalid.usedGatewayReceipt, true);
    assert.equal(invalid.recordedAt.toISOString(), "2026-09-20T10:00:00.200Z");
    const future = resolveEventTimestamp({
      deviceEventTime: "2028-01-01T00:00:00.000Z",
      gatewayReceiveTime: "2026-09-20T10:00:00.200Z",
      nowMs: now,
    });
    assert.equal(future.usedGatewayReceipt, true);
  });

  it("labels operation modes and forbids software weight offsets", () => {
    assert.equal(isOperationMode("PILOT"), true);
    assert.equal(operationModeLabel("SIMULATION"), "SIMULATED");
    assert.match(rejectWeightOffset({ offsetKg: 12 }) ?? "", /offsets/);
    assert.equal(rejectWeightOffset({ notes: "installed" }), null);
    assert.match(METROLOGY_NOTICE, /does not apply software weight offsets/i);
    assert.equal(installationStatusRejection("PRODUCTION", "SIMULATOR"), "Production installation requires a documented manufacturer protocol");
    assert.equal(installationStatusRejection("PILOT", "PROTOCOL_TEST_ONLY"), null);
  });

  it("defines commissioning items and restricts the pilot page from drivers", () => {
    assert.ok(commissioningItemsForDeviceType("WEIGHBRIDGE_INDICATOR").length >= 8);
    assert.equal(isCommissioningTestResult("NOT_TESTED"), true);
    assert.equal(callPermission("hardware.pilot", user()), undefined);
    assert.ok(
      callPermission(
        "hardware.pilot",
        user({ permissions: ["transaction.read"], roles: [{ id: "r", code: "DRIVER", name: "Driver", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }] }),
      ) instanceof HttpError,
    );
    assert.equal(AUDIT_ACTIONS.COMMISSIONING_TEST_RECORDED, "COMMISSIONING_TEST_RECORDED");
  });
});
