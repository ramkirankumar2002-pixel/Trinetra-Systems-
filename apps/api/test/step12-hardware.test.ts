import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { WeighmentSource } from "@prisma/client";
import { defaultConnectionType, rejectCredentialFields, validateHardwareConfig } from "../src/domain/hardwareConfig.js";
import { deriveDeviceHealth } from "../src/domain/hardwareStatus.js";
import { applyModbusScale, parseModbusMapping } from "../src/domain/modbusMapping.js";
import { calculateNetWeight } from "../src/domain/netWeight.js";
import { EVENT_KEYS } from "../src/domain/notificationCatalog.js";
import { readingFromMilliKg } from "../src/domain/normalizedWeight.js";
import { DEFAULT_SIMULATOR_STABILITY, StabilityTracker } from "../src/domain/stability.js";
import { officialWeighmentRejection } from "../src/domain/weighmentAcceptance.js";
import { isOfficialWeighmentQuality, weighmentQualityMessage } from "../src/domain/weightQuality.js";
import { SimulatorWeightProvider } from "../src/integrations/weighbridge/adapters/simulatorAdapter.js";
import { SerialWeightProvider } from "../src/integrations/weighbridge/adapters/serialAdapter.js";
import { ModbusWeightProvider } from "../src/integrations/weighbridge/adapters/modbusAdapter.js";
import { ConnectionManager } from "../src/integrations/weighbridge/connectionManager.js";
import { GenericTextWeightParser } from "../src/integrations/weighbridge/parsers/genericTextParser.js";
import { SimulatorParser } from "../src/integrations/weighbridge/parsers/simulatorParser.js";
import { SimulatedWeighbridgeProvider } from "../src/integrations/weighbridge/simulatedWeighbridgeProvider.js";
import type { IWeightProvider, ProviderFactoryInput } from "../src/integrations/weighbridge/provider.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { parseWeighmentInput } from "../src/modules/transactions/validators.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";
import { BaseWeightProvider } from "../src/integrations/weighbridge/baseProvider.js";
import { emptyReading } from "../src/domain/normalizedWeight.js";

const limits = { minKg: 50, maxKg: 120_000 };

function factoryInput(overrides: Partial<ProviderFactoryInput> = {}): ProviderFactoryInput {
  return {
    profileId: "profile_1",
    organizationId: "org",
    siteId: "site_a",
    weighbridgeId: "wb_1",
    weighbridgeCode: "WB-01",
    deviceName: "Demo Weighbridge 01",
    deviceIdentifier: "WB-01",
    providerType: "SIMULATOR",
    unit: "KG",
    pollingIntervalMs: 200,
    connectionTimeoutMs: 3000,
    healthTimeoutMs: 15_000,
    simulatorMode: "STABLE",
    simulatorBaseKg: "35000.000",
    stabilityToleranceKg: "5.000",
    stabilityConsecutive: 3,
    stabilityDurationMs: 200,
    ...overrides,
  };
}

function startInput(overrides: Partial<ProviderFactoryInput> = {}) {
  return {
    ...factoryInput(overrides),
    enabled: true,
    reconnectEnabled: true,
    reconnectDelayMs: 20,
    maxReconnectAttempts: 3,
  };
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
    permissions: ["weighbridge.read", "weighment.record"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function callPermission(permission: string, auth: AuthenticatedUser): unknown {
  let caught: unknown;
  requirePermission(permission)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      caught = error;
    }) as NextFunction,
  );
  return caught;
}

class ScriptedProvider extends BaseWeightProvider {
  constructor(
    private outcomes: Array<"ok" | "fail">,
  ) {
    super("profile_scripted", "wb_scripted", "SIMULATOR", 1000);
  }

  async connect(): Promise<void> {
    const next = this.outcomes.shift() ?? "fail";
    if (next === "ok") {
      this.setStatus("CONNECTED");
      return;
    }
    this.setStatus("ERROR", "temporary failure");
  }

  async disconnect(): Promise<void> {
    this.setStatus("DISCONNECTED");
  }

  async readNormalized() {
    if (this.status !== "CONNECTED") {
      return emptyReading({
        weighbridgeId: this.weighbridgeId,
        deviceIdentifier: "WB-S",
        providerType: "SIMULATOR",
        source: "SIMULATOR",
        quality: "DEVICE_ERROR",
        connectionStatus: this.status,
        statusDetail: this.lastError,
      });
    }
    return readingFromMilliKg({
      milliKg: 35_000_000n,
      unit: "KG",
      quality: "STABLE",
      providerType: "SIMULATOR",
      source: "SIMULATOR",
      deviceIdentifier: "WB-S",
      weighbridgeId: this.weighbridgeId,
      connectionStatus: "CONNECTED",
    });
  }
}

const managers: ConnectionManager[] = [];

afterEach(async () => {
  for (const manager of managers) {
    await manager.shutdown();
  }
  managers.length = 0;
});

describe("weight normalization and stability", () => {
  it("keeps milligram arithmetic for official net weight", () => {
    const net = calculateNetWeight("35000.250", "14820.125");
    assert.equal(net.netAsDecimal, "20180.125");
    assert.equal(net.tareExceedsGross, false);
  });

  it("marks a window stable only after consecutive readings stay in tolerance", () => {
    const tracker = new StabilityTracker({ ...DEFAULT_SIMULATOR_STABILITY, consecutiveReadings: 3, durationMs: 100 });
    assert.equal(tracker.add(35_000_000n, new Date(1000)), "UNSTABLE");
    assert.equal(tracker.add(35_001_000n, new Date(1050)), "UNSTABLE");
    assert.equal(tracker.add(35_002_000n, new Date(1100)), "STABLE");
    assert.equal(tracker.add(35_020_000n, new Date(1200)), "UNSTABLE");
  });

  it("rejects official weighment unless the device is connected and stable", () => {
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "DISCONNECTED",
        quality: "STABLE",
        weightKg: "35000.000",
        unit: "KG",
        expectedUnit: "KG",
        limits,
      }),
      "Stable weight reading is not available.",
    );
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "CONNECTED",
        quality: "UNSTABLE",
        weightKg: "35000.000",
        unit: "KG",
        expectedUnit: "KG",
        limits,
      }),
      weighmentQualityMessage("UNSTABLE"),
    );
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: "CONNECTED",
        quality: "STABLE",
        weightKg: "35000.000",
        unit: "KG",
        expectedUnit: "KG",
        limits,
      }),
      null,
    );
    assert.equal(isOfficialWeighmentQuality("UNSTABLE"), false);
  });
});

describe("simulator adapter and parsers", () => {
  it("keeps the existing simulated reader contract", async () => {
    const reader = new SimulatedWeighbridgeProvider(35000);
    const reading = await reader.readWeight("wb_1");
    assert.equal(reading.source, "SIMULATED");
    assert.equal(reading.kg, 35000);
  });

  it("connects the simulator and becomes stable without hardware", async () => {
    let now = 1_000_000;
    const provider = new SimulatorWeightProvider(factoryInput(), () => now);
    await provider.connect();
    assert.equal(provider.getStatus(), "CONNECTED");
    await provider.readNormalized();
    now += 100;
    await provider.readNormalized();
    now += 100;
    const stable = await provider.readNormalized();
    assert.equal(stable.source, "SIMULATOR");
    assert.equal(stable.quality, "STABLE");
    assert.equal(stable.weightKg, "35000.000");
    assert.equal(stable.providerType, "SIMULATOR");
  });

  it("can produce an unstable simulator reading", async () => {
    const provider = new SimulatorWeightProvider(factoryInput({ simulatorMode: "UNSTABLE" }));
    await provider.connect();
    const first = await provider.readNormalized();
    const second = await provider.readNormalized();
    assert.notEqual(first.milliKg, second.milliKg);
    assert.equal(second.quality, "UNSTABLE");
  });

  it("parses simulator JSON and generic text without claiming manufacturer compatibility", () => {
    const simulator = new SimulatorParser();
    const parsed = simulator.parse(JSON.stringify({ kg: "12540.000", unit: "KG" }));
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.milliKg, 12_540_000n);
    }
    const text = new GenericTextWeightParser();
    const frame = text.parse("ST,GS,+0012540.0kg");
    assert.equal(frame.ok, true);
    const invalid = text.parse("NO WEIGHT");
    assert.equal(invalid.ok, false);
  });
});

describe("serial tcp and modbus foundations", () => {
  it("does not fake a serial connection", async () => {
    const provider = new SerialWeightProvider(factoryInput({ providerType: "SERIAL", serialPort: "COM1", baudRate: 9600 }));
    await provider.connect();
    assert.equal(provider.getStatus(), "ERROR");
    const reading = await provider.readNormalized();
    assert.equal(reading.source, "HARDWARE");
    assert.equal(reading.quality, "DEVICE_ERROR");
  });

  it("requires a manufacturer Modbus map and does not invent registers", () => {
    const missing = parseModbusMapping(null);
    assert.equal(typeof missing, "string");
    const mapping = parseModbusMapping({
      weightRegister: 40001,
      unitId: 1,
      functionCode: 3,
      byteOrder: "ABCD",
      scaleNumerator: 1,
      scaleDenominator: 1,
    });
    assert.notEqual(typeof mapping, "string");
    if (typeof mapping !== "string") {
      assert.equal(applyModbusScale(35000n, mapping), 35000n);
    }
  });

  it("leaves Modbus disconnected until a real map and transport exist", async () => {
    const provider = new ModbusWeightProvider(factoryInput({ providerType: "MODBUS_TCP", host: "10.0.0.8", port: 502 }));
    await provider.connect();
    assert.equal(provider.getStatus(), "ERROR");
  });
});

describe("connection manager and health", () => {
  it("starts one simulator connection and refuses a duplicate", async () => {
    const manager = new ConnectionManager();
    managers.push(manager);
    const first = await manager.start(startInput());
    const second = await manager.start(startInput());
    assert.equal(first.weighbridgeId, second.weighbridgeId);
    assert.equal(manager.listSnapshots().length, 1);
    assert.equal(first.status, "CONNECTED");
  });

  it("reconnects after a recoverable failure", async () => {
    const scripted = new ScriptedProvider(["fail", "ok"]);
    const manager = new ConnectionManager({}, () => scripted as IWeightProvider);
    managers.push(manager);
    await manager.start(startInput({ weighbridgeId: "wb_scripted" }));
    assert.equal(manager.getSnapshot("wb_scripted")?.status, "ERROR");
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(manager.getSnapshot("wb_scripted")?.status, "CONNECTED");
  });

  it("does not mark a configured but silent device healthy", () => {
    const health = deriveDeviceHealth({
      enabled: true,
      status: "DISCONNECTED",
      lastCommunicationAt: null,
      lastSuccessfulReadingAt: null,
      lastError: null,
      now: new Date(),
      healthTimeoutMs: 15_000,
    });
    assert.equal(health.healthy, false);
  });
});

describe("configuration validation and RBAC", () => {
  it("validates provider-specific fields and rejects credentials", () => {
    assert.equal(defaultConnectionType("TCP"), "TCP");
    assert.equal(
      validateHardwareConfig(
        {
          providerType: "TCP",
          connectionType: "TCP",
          deviceName: "WB-01",
          deviceIdentifier: "WB-01",
          enabled: true,
          unit: "KG",
          pollingIntervalMs: 500,
          connectionTimeoutMs: 3000,
          healthTimeoutMs: 15000,
          reconnectEnabled: true,
          reconnectDelayMs: 3000,
          maxReconnectAttempts: 5,
          stabilityToleranceKg: "5.000",
          stabilityConsecutive: 3,
          stabilityDurationMs: 1500,
          simulatorMode: "AUTO",
        },
        true,
      ),
      "Host or IP is required for this connection type",
    );
    assert.equal(rejectCredentialFields({ password: "secret" }), "Device credentials are not stored. Remove credential fields from the request.");
  });

  it("lets operators view live weight but not change hardware configuration", () => {
    const operator = user();
    assert.equal(callPermission("weighment.record", operator), undefined);
    assert.ok(callPermission("weighbridge.manage", operator) instanceof HttpError);
    const manager = user({
      permissions: ["weighbridge.read", "weighbridge.manage", "dashboard.read"],
      roles: [{ id: "role_office", code: "OFFICE_MANAGER", name: "Office Manager", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    });
    assert.equal(callPermission("weighbridge.manage", manager), undefined);
    const driver = user({
      permissions: ["transaction.read"],
      roles: [{ id: "role_driver", code: "DRIVER", name: "Driver", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    });
    assert.ok(callPermission("weighbridge.manage", driver) instanceof HttpError);
    assert.ok(callPermission("weighbridge.read", driver) instanceof HttpError);
  });

  it("keeps hardware lookups site-scoped", () => {
    const siteA = user();
    const siteB = user({
      defaultSite: { id: "site_b", code: "SITE-B", name: "Site B" },
      roles: [{ id: "role_site", code: "SITE_USER", name: "Site User", site: { id: "site_b", code: "SITE-B", name: "Site B" } }],
    });
    assert.equal(canAccessSite(siteA, "site_a"), true);
    assert.equal(canAccessSite(siteA, "site_b"), false);
    assert.equal(canAccessSite(siteB, "site_a"), false);
  });

  it("keeps the typed weighment path from claiming HARDWARE", () => {
    assert.throws(() => parseWeighmentInput({ weightKg: "35000", source: "HARDWARE" }), (error: unknown) => {
      return error instanceof HttpError && error.status === 400;
    });
    assert.equal(parseWeighmentInput({ weightKg: "35000", source: "SIMULATED" }).source, WeighmentSource.SIMULATED);
    assert.equal(parseWeighmentInput({ weightKg: "35000", source: "MANUAL" }).source, WeighmentSource.MANUAL);
  });
});

describe("device weighment acceptance flow", () => {
  it("captures stable gross and tare from the simulator and calculates net", async () => {
    let now = 5_000_000;
    const provider = new SimulatorWeightProvider(factoryInput({ simulatorBaseKg: "35000.000" }), () => now);
    await provider.connect();
    await provider.readNormalized();
    now += 100;
    await provider.readNormalized();
    now += 100;
    const gross = await provider.readNormalized();
    assert.equal(gross.quality, "STABLE");
    assert.equal(
      officialWeighmentRejection({
        connectionStatus: gross.connectionStatus,
        quality: gross.quality,
        weightKg: gross.weightKg,
        unit: gross.unit,
        expectedUnit: "KG",
        limits,
      }),
      null,
    );

    const tareProvider = new SimulatorWeightProvider(factoryInput({ simulatorBaseKg: "14820.000" }), () => now);
    await tareProvider.connect();
    await tareProvider.readNormalized();
    now += 100;
    await tareProvider.readNormalized();
    now += 100;
    const tare = await tareProvider.readNormalized();
    assert.equal(tare.quality, "STABLE");
    const net = calculateNetWeight(gross.weightKg, tare.weightKg);
    assert.equal(net.netAsDecimal, "20180.000");
    assert.equal(gross.source, "SIMULATOR");
    assert.equal(tare.source, "SIMULATOR");
  });

  it("rejects an unstable official weighment", async () => {
    const provider = new SimulatorWeightProvider(factoryInput({ simulatorMode: "UNSTABLE" }));
    await provider.connect();
    const reading = await provider.readNormalized();
    const rejected = officialWeighmentRejection({
      connectionStatus: reading.connectionStatus,
      quality: reading.quality,
      weightKg: reading.weightKg,
      unit: reading.unit,
      expectedUnit: "KG",
      limits,
    });
    assert.equal(rejected, "Stable weight reading is not available.");
  });

  it("records hardware source tracking and audit names", () => {
    const hardware = readingFromMilliKg({
      milliKg: 12_540_000n,
      unit: "KG",
      quality: "STABLE",
      providerType: "TCP",
      source: "HARDWARE",
      deviceIdentifier: "WB-01",
      weighbridgeId: "wb_1",
      connectionStatus: "CONNECTED",
    });
    assert.equal(hardware.source, "HARDWARE");
    assert.equal(AUDIT_ACTIONS.HARDWARE_ENABLED, "HARDWARE_ENABLED");
    assert.equal(AUDIT_ACTIONS.HARDWARE_DISABLED, "HARDWARE_DISABLED");
    assert.equal(AUDIT_ACTIONS.FIRST_WEIGHMENT_RECORDED, "FIRST_WEIGHMENT_RECORDED");
    assert.ok(EVENT_KEYS.hardwareDisconnected("wb_1", "inc_1").includes("hardware.disconnected"));
    assert.ok(EVENT_KEYS.hardwareRecovered("wb_1", "inc_1").includes("hardware.recovered"));
  });

  it("emits a disconnect transition for alerts without duplicating a connected start", async () => {
    const events: string[] = [];
    const manager = new ConnectionManager({
      onTransition: (event) => events.push(`${event.from}->${event.to}`),
    });
    managers.push(manager);
    await manager.start(startInput());
    await manager.stop("wb_1", "Device disabled");
    assert.ok(events.includes("CONNECTED->DISABLED"));
  });
});
