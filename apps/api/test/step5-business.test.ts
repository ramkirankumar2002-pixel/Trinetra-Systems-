import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransactionStatus } from "@prisma/client";
import { allowedActions, canTransition } from "../src/domain/transactionState.js";
import { formatReferenceNumber, parseReferenceSequence, referencePrefix } from "../src/domain/referenceNumber.js";
import {
  displayRegistrationNumber,
  normalizeRegistrationNumber,
  validateRegistrationNumber,
} from "../src/domain/vehicleNumber.js";
import { deriveWeighbridgeStatus } from "../src/domain/weighbridgeStatus.js";
import { assertWeightWithinLimits, parseWeightKg } from "../src/domain/weight.js";
import { SimulatedAnprProvider } from "../src/integrations/anpr/simulatedAnprProvider.js";
import { SimulatedWeighbridgeProvider } from "../src/integrations/weighbridge/simulatedWeighbridgeProvider.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";
import { parseCreateTransactionInput, parseWeighmentInput } from "../src/modules/transactions/validators.js";
import { parseVehicleCreateInput } from "../src/modules/vehicles/validators.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import type { NextFunction, Request, Response } from "express";

describe("vehicle creation and search keys", () => {
  it("normalizes plates so spaces and case do not create duplicates", () => {
    assert.equal(normalizeRegistrationNumber("ap39 xx 1234"), "AP39XX1234");
    assert.equal(normalizeRegistrationNumber("MH-12-AB-1234"), "MH12AB1234");
    assert.equal(displayRegistrationNumber("mh12 ab 1234"), "MH12 AB 1234");
  });

  it("rejects an invalid vehicle number", () => {
    assert.equal(validateRegistrationNumber("AB"), "Vehicle number must be 4–15 letters or digits");
    const created = parseVehicleCreateInput({
      registrationNumber: "AP39XX1234",
      vehicleType: "Truck",
      transporterName: "Deccan Haulage",
    });
    assert.equal(created.registrationNumber, "AP39XX1234");
    assert.equal(created.transporterName, "Deccan Haulage");
  });

  it("treats the same normalized plate as a duplicate key", () => {
    const first = parseVehicleCreateInput({ registrationNumber: "AP 39XX 1234" });
    const second = parseVehicleCreateInput({ registrationNumber: "ap39xx1234" });
    assert.equal(first.registrationNumber, second.registrationNumber);
  });
});

describe("transaction creation", () => {
  it("requires a weighbridge", () => {
    assert.throws(() => parseCreateTransactionInput({}), (error: unknown) => {
      return error instanceof HttpError && error.status === 400;
    });
  });

  it("accepts a valid create payload", () => {
    const input = parseCreateTransactionInput({ weighbridgeId: "wb_1", siteId: "site_1" });
    assert.equal(input.weighbridgeId, "wb_1");
    assert.equal(input.siteId, "site_1");
  });

  it("builds a unique human-readable reference", () => {
    assert.equal(formatReferenceNumber(2026, 1), "TRN-2026-000001");
    assert.equal(parseReferenceSequence("TRN-2026-000002", 2026), 2);
    assert.equal(referencePrefix(2026), "TRN-2026-");
  });
});

describe("simulated identification and first weighment", () => {
  it("marks ANPR output as simulated", async () => {
    const reader = new SimulatedAnprProvider(["AP39XX1234"]);
    const result = await reader.readPlate({ weighbridgeId: "wb_1" });
    assert.equal(result.source, "SIMULATED");
    assert.equal(result.provider, "simulated-anpr");
    assert.equal(result.plate, "AP39XX1234");
  });

  it("creates a first weighment payload from a valid weight", () => {
    const parsed = parseWeightKg("35000");
    assert.notEqual(typeof parsed, "string");
    if (typeof parsed !== "string") {
      assert.equal(parsed.kg, 35000);
    }
    const input = parseWeighmentInput({ weightKg: "35000", source: "SIMULATED" });
    assert.equal(input.source, "SIMULATED");
  });

  it("rejects a negative weight", () => {
    assert.equal(parseWeightKg(-10), "Weight cannot be negative");
    assert.equal(parseWeightKg("0"), "Weight must be greater than zero");
    const parsed = parseWeightKg("10");
    if (typeof parsed !== "string") {
      assert.equal(assertWeightWithinLimits(parsed, { minKg: 50, maxKg: 120000 }), "Weight must be between 50 and 120000 kg");
    }
  });
});

describe("transaction state", () => {
  it("allows the Step 5 path and blocks invalid jumps", () => {
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.IDENTIFIED), true);
    assert.equal(canTransition(TransactionStatus.IDENTIFIED, TransactionStatus.FIRST_WEIGHMENT), true);
    assert.equal(canTransition(TransactionStatus.ARRIVED, TransactionStatus.FIRST_WEIGHMENT), false);
    assert.deepEqual(allowedActions(TransactionStatus.ARRIVED, false), ["identify"]);
    assert.deepEqual(allowedActions(TransactionStatus.IDENTIFIED, false), ["upload_document", "record_gross"]);
    assert.deepEqual(allowedActions(TransactionStatus.FIRST_WEIGHMENT, true), []);
  });
});

describe("authorization and audit", () => {
  it("returns 403 when the user lacks permission", () => {
    const user: AuthenticatedUser = {
      id: "user_1",
      fullName: "Office",
      email: "office@demo.local",
      isActive: true,
      organization: { id: "org", name: "Demo", slug: "demo" },
      defaultDepartment: null,
      defaultSite: null,
      roles: [],
      permissions: ["transaction.read"],
      organizationId: "org",
      sessionId: "session",
    };

    const middleware = requirePermission("weighment.record");
    let captured: unknown;
    middleware(
      { auth: user } as Request,
      {} as Response,
      ((error?: unknown) => {
        captured = error;
      }) as NextFunction,
    );

    assert.ok(captured instanceof HttpError);
    assert.equal((captured as HttpError).status, 403);
  });

  it("records named audit actions for vehicle and weighbridge events", () => {
    assert.equal(AUDIT_ACTIONS.VEHICLE_CREATED, "VEHICLE_CREATED");
    assert.equal(AUDIT_ACTIONS.TRANSACTION_CREATED, "TRANSACTION_CREATED");
    assert.equal(AUDIT_ACTIONS.VEHICLE_IDENTIFIED, "VEHICLE_IDENTIFIED");
    assert.equal(AUDIT_ACTIONS.FIRST_WEIGHMENT_RECORDED, "FIRST_WEIGHMENT_RECORDED");
  });
});

describe("weighbridge software status", () => {
  it("derives operational status without hardware", () => {
    assert.equal(deriveWeighbridgeStatus({ isActive: false, hasActiveMaintenance: false, hasOpenTransaction: false }), "OFFLINE");
    assert.equal(deriveWeighbridgeStatus({ isActive: true, hasActiveMaintenance: true, hasOpenTransaction: false }), "MAINTENANCE");
    assert.equal(deriveWeighbridgeStatus({ isActive: true, hasActiveMaintenance: false, hasOpenTransaction: true }), "BUSY");
    assert.equal(deriveWeighbridgeStatus({ isActive: true, hasActiveMaintenance: false, hasOpenTransaction: false }), "AVAILABLE");
  });

  it("keeps simulated weighbridge readings in software", async () => {
    const reader = new SimulatedWeighbridgeProvider(35000);
    const reading = await reader.readWeight("wb_1");
    assert.equal(reading.source, "SIMULATED");
    assert.equal(reading.kg, 35000);
  });
});
