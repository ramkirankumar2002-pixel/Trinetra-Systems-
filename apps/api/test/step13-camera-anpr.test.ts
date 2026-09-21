import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyAnprConfidence, parseConfidenceThresholds } from "../src/domain/anprConfidence.js";
import { assertAnprLifecycle, canAdvanceAnprLifecycle } from "../src/domain/anprLifecycle.js";
import {
  publicConfiguredUrl,
  rejectCameraCredentialFields,
  sanitizeConfiguredUrl,
  validateCameraConfig,
} from "../src/domain/cameraConfig.js";
import { deriveCameraHealth } from "../src/domain/cameraStatus.js";
import { canConfirmWithoutCorrection, decideIdentification } from "../src/domain/identificationDecision.js";
import { EVENT_KEYS } from "../src/domain/notificationCatalog.js";
import {
  displayRegistrationNumber,
  normalizeRegistrationNumber,
  validateRegistrationNumber,
} from "../src/domain/vehicleNumber.js";
import { buildSimulatedAnprResult } from "../src/integrations/anpr/scenarios.js";
import { SimulatedAnprProvider } from "../src/integrations/anpr/simulatedAnprProvider.js";
import { SimulatorCameraProvider } from "../src/integrations/cameras/adapters/simulatorAdapter.js";
import { UndeployedCameraProvider } from "../src/integrations/cameras/adapters/undeployedAdapter.js";
import { CameraConnectionManager } from "../src/integrations/cameras/connectionManager.js";
import type { CameraFactoryInput } from "../src/integrations/cameras/types.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { parseCameraCreate, parseCorrectInput, parseManualInput } from "../src/modules/cameras/validators.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";
import { canTransition } from "../src/domain/transactionState.js";
import { TransactionStatus } from "@prisma/client";

function cameraInput(overrides: Partial<CameraFactoryInput> = {}): CameraFactoryInput {
  return {
    cameraId: "cam_1",
    organizationId: "org",
    siteId: "site_a",
    weighbridgeId: "wb_1",
    name: "ENTRY CAMERA 01",
    cameraIdentifier: "ENTRY-01",
    cameraProviderType: "SIMULATOR",
    connectionType: "SIMULATOR",
    enabled: true,
    simulatorScenario: "HIGH_KNOWN",
    ...overrides,
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
    roles: [
      {
        id: "role_wb",
        code: "WEIGHBRIDGE_OPERATOR",
        name: "Weighbridge Operator",
        site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
      },
    ],
    permissions: ["camera.read", "weighbridge.read", "transaction.create", "vehicle.read"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function callPermission(code: string, auth: AuthenticatedUser): unknown {
  let captured: unknown;
  requirePermission(code)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      captured = error;
    }) as NextFunction,
  );
  return captured;
}

describe("ANPR confidence bands", () => {
  it("classifies high, medium, low, and none from configurable thresholds", () => {
    const thresholds = { highMin: 0.9, mediumMin: 0.7 };
    assert.equal(classifyAnprConfidence(0.96, thresholds), "HIGH");
    assert.equal(classifyAnprConfidence(0.78, thresholds), "MEDIUM");
    assert.equal(classifyAnprConfidence(0.41, thresholds), "LOW");
    assert.equal(classifyAnprConfidence(null, thresholds), "NONE");
    assert.equal(classifyAnprConfidence(0, thresholds), "NONE");
  });

  it("rejects inverted thresholds", () => {
    assert.equal(parseConfidenceThresholds({ highMin: 0.5, mediumMin: 0.8 }), "Medium confidence threshold cannot be higher than the high threshold");
  });
});

describe("plate normalization", () => {
  it("uppercases and removes separators without lookalike substitution", () => {
    assert.equal(normalizeRegistrationNumber(" ap 39-xx 1234 "), "AP39XX1234");
    assert.equal(displayRegistrationNumber("ap 39 xx 1234"), "AP 39 XX 1234");
    assert.equal(normalizeRegistrationNumber("KA01AB1234"), "KA01AB1234");
    assert.notEqual(normalizeRegistrationNumber("BOSS01"), "B0SS01");
  });

  it("rejects invalid input", () => {
    assert.equal(normalizeRegistrationNumber("   "), "");
    assert.equal(validateRegistrationNumber(""), "Vehicle number must be 4–15 letters or digits");
    assert.equal(validateRegistrationNumber("AB"), "Vehicle number must be 4–15 letters or digits");
  });
});

describe("simulated ANPR provider", () => {
  it("returns high-confidence known, medium, low, unknown, none, and multiple candidates", async () => {
    const high = buildSimulatedAnprResult({
      scenario: "HIGH_KNOWN",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(high.source, "SIMULATED");
    assert.equal(high.provider, "simulated-anpr");
    assert.equal(high.normalizedPlateNumber, "AP39XX1234");
    assert.equal(high.confidenceBand, "HIGH");

    const medium = buildSimulatedAnprResult({
      scenario: "MEDIUM_KNOWN",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(medium.confidenceBand, "MEDIUM");
    assert.equal(medium.normalizedPlateNumber, "MH12AB1234");

    const low = buildSimulatedAnprResult({
      scenario: "LOW",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(low.confidenceBand, "LOW");

    const unknown = buildSimulatedAnprResult({
      scenario: "UNKNOWN",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(unknown.normalizedPlateNumber, "KA01ZZ9999");

    const none = buildSimulatedAnprResult({
      scenario: "NO_PLATE",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(none.plateNumber, null);
    assert.equal(none.confidenceBand, "NONE");

    const multi = buildSimulatedAnprResult({
      scenario: "MULTI_CANDIDATE",
      capturedAt: "2026-09-20T10:00:00.000Z",
      imageStorageKey: null,
      thresholds: { highMin: 0.9, mediumMin: 0.7 },
      processingDurationMs: 4,
    });
    assert.equal(multi.candidates.length, 3);
    assert.equal(multi.confidenceBand, "MEDIUM");
  });

  it("keeps the Step 5 readPlate contract marked SIMULATED", async () => {
    const reader = new SimulatedAnprProvider(["AP39XX1234"]);
    const result = await reader.readPlate({ weighbridgeId: "wb_1" });
    assert.equal(result.source, "SIMULATED");
    assert.equal(result.plate, "AP39XX1234");
  });
});

describe("vehicle identification decision", () => {
  it("looks up a high-confidence match and requires confirmation", () => {
    const decision = decideIdentification({
      confidenceBand: "HIGH",
      plateDetected: true,
      vehicleMatched: true,
      candidateCount: 1,
    });
    assert.equal(decision.action, "CONFIRM");
    assert.equal(canConfirmWithoutCorrection("HIGH"), true);
  });

  it("does not treat a missing vehicle as identified", () => {
    const decision = decideIdentification({
      confidenceBand: "HIGH",
      plateDetected: true,
      vehicleMatched: false,
      candidateCount: 1,
    });
    assert.equal(decision.action, "NO_MATCH");
  });

  it("requires selection when multiple medium-confidence candidates exist", () => {
    const decision = decideIdentification({
      confidenceBand: "MEDIUM",
      plateDetected: true,
      vehicleMatched: true,
      candidateCount: 3,
    });
    assert.equal(decision.action, "SELECT_CANDIDATE");
    assert.equal(decision.autoSelectPlate, false);
  });

  it("requires correction for low confidence and manual entry when no plate", () => {
    assert.equal(
      decideIdentification({
        confidenceBand: "LOW",
        plateDetected: true,
        vehicleMatched: true,
        candidateCount: 1,
      }).action,
      "CORRECTION_REQUIRED",
    );
    assert.equal(
      decideIdentification({
        confidenceBand: "NONE",
        plateDetected: false,
        vehicleMatched: false,
        candidateCount: 0,
      }).action,
      "MANUAL_REQUIRED",
    );
    assert.equal(canConfirmWithoutCorrection("LOW"), false);
  });
});

describe("ANPR lifecycle", () => {
  it("allows confirm, correct, and reject from detected results", () => {
    assert.equal(canAdvanceAnprLifecycle("DETECTED", "MATCHED"), true);
    assert.equal(canAdvanceAnprLifecycle("MATCHED", "CONFIRMED"), true);
    assert.equal(canAdvanceAnprLifecycle("DETECTED", "CORRECTED"), true);
    assert.equal(canAdvanceAnprLifecycle("CORRECTED", "CONFIRMED"), true);
    assert.equal(canAdvanceAnprLifecycle("DETECTED", "REJECTED"), true);
    assert.equal(canAdvanceAnprLifecycle("CONFIRMED", "REJECTED"), false);
    assert.equal(assertAnprLifecycle("REJECTED", "CONFIRMED"), "ANPR result cannot move from REJECTED to CONFIRMED");
  });
});

describe("camera providers", () => {
  it("connects the simulator and captures a labeled frame", async () => {
    const provider = new SimulatorCameraProvider(cameraInput());
    await provider.initialize();
    assert.equal(provider.getStatus().status, "CONNECTED");
    const frame = await provider.captureFrame();
    assert.equal(frame.source, "SIMULATED");
    assert.equal(frame.mimeType, "image/png");
    assert.ok(frame.bytes.length > 0);
  });

  it("does not open physical camera connections", async () => {
    const provider = new UndeployedCameraProvider(cameraInput({ cameraProviderType: "RTSP", connectionType: "RTSP" }));
    await provider.initialize();
    assert.equal(provider.getStatus().status, "ERROR");
    await assert.rejects(() => provider.captureFrame());
  });

  it("reports disabled and disconnected states from the manager", async () => {
    const manager = new CameraConnectionManager();
    const disabled = await manager.start(cameraInput({ enabled: false }));
    assert.equal(disabled.status, "DISABLED");
    const connected = await manager.start(cameraInput());
    assert.equal(connected.status, "CONNECTED");
    await manager.stop("cam_1", "Runtime shutdown");
    assert.equal(manager.getSnapshot("cam_1"), null);
  });
});

describe("camera configuration safety", () => {
  it("rejects credentials and strips userinfo from URLs", () => {
    assert.equal(rejectCameraCredentialFields({ password: "secret" }), "Camera credentials cannot be submitted through this API");
    assert.equal(sanitizeConfiguredUrl("rtsp://user:pass@10.0.0.8/stream"), "rtsp://10.0.0.8/stream");
    assert.equal(publicConfiguredUrl("not a url with secret"), "[configured]");
    assert.equal(
      validateCameraConfig({
        name: "Entry",
        cameraIdentifier: "ENTRY-01",
        purpose: "ENTRY_ANPR",
        cameraProviderType: "RTSP",
        connectionType: "RTSP",
        anprProviderType: "SIMULATOR",
        enabled: true,
        highConfidenceMin: 0.9,
        mediumConfidenceMin: 0.7,
        simulatorScenario: "HIGH_KNOWN",
      }),
      "An explicit snapshot or stream URL is required for this connection type",
    );
  });

  it("parses camera and identification payloads", () => {
    const created = parseCameraCreate({
      weighbridgeId: "wb_1",
      name: "ENTRY CAMERA 01",
      cameraIdentifier: "ENTRY-01",
    });
    assert.equal(created.cameraProviderType, "SIMULATOR");
    assert.equal(parseCorrectInput({ plate: "KA 01 AB 1234", reason: "Misread" }).plate, "KA 01 AB 1234");
    assert.equal(parseManualInput({ registrationNumber: "KA01AB1234" }).plate, "KA01AB1234");
  });
});

describe("RBAC and site isolation", () => {
  it("allows authorized operators to read cameras and denies drivers", () => {
    assert.equal(callPermission("camera.read", user()), undefined);
    assert.ok(callPermission("camera.manage", user()) instanceof HttpError);
    assert.ok(callPermission("camera.read", user({ permissions: ["transaction.read"], roles: [] })) instanceof HttpError);
  });

  it("blocks another site even when the user is authenticated", () => {
    const operator = user();
    assert.equal(canAccessSite(operator, "site_a"), true);
    assert.equal(canAccessSite(operator, "site_b"), false);
  });
});

describe("audit and notification keys", () => {
  it("names detection, confirmation, correction, and manual-entry actions", () => {
    assert.equal(AUDIT_ACTIONS.ANPR_DETECTION, "ANPR_DETECTION");
    assert.equal(AUDIT_ACTIONS.VEHICLE_CONFIRMATION, "VEHICLE_CONFIRMATION");
    assert.equal(AUDIT_ACTIONS.ANPR_CORRECTED, "ANPR_CORRECTED");
    assert.equal(AUDIT_ACTIONS.VEHICLE_MANUAL_ENTRY, "VEHICLE_MANUAL_ENTRY");
    assert.equal(AUDIT_ACTIONS.VEHICLE_MATCHED, "VEHICLE_MATCHED");
    assert.equal(AUDIT_ACTIONS.VEHICLE_NOT_FOUND, "VEHICLE_NOT_FOUND");
    assert.match(EVENT_KEYS.cameraDisconnected("cam_1", "inc"), /camera.disconnected/);
    assert.match(EVENT_KEYS.anprUnavailable("cam_1", "inc"), /anpr.unavailable/);
  });
});

describe("transaction identification reuse", () => {
  it("keeps ARRIVED → IDENTIFIED as the only public identification transition", () => {
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.IDENTIFIED), true);
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.FIRST_WEIGHMENT), false);
  });
});
