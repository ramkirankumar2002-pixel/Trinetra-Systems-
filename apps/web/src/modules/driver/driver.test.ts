import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EN, HI, TE, type TranslationKey } from "./translations.ts";
import { translate } from "./i18n.ts";
import {
  mapTranscriptToIntent,
  SimulatedSpeechToTextProvider,
  SimulatedTextToSpeechProvider,
  isDriverIntent,
} from "./voice.ts";
import { AUDIO_CUES, SimulatedAudioFeedbackProvider } from "./audio.ts";
import {
  connectivityLabelKey,
  driverOfflineGuidance,
  exceptionCopy,
  friendlyDriverErrorKey,
  progressStepForScreen,
  resolveConnectivityTone,
  resolveDriverScreen,
  shouldConfirmTransactionSwitch,
  weightStatusKey,
} from "./workflow.ts";
import { hasPermission } from "../../shared/auth/permissions.ts";
import type { PublicUser } from "../../shared/auth/types.ts";
import type { PublicTransaction } from "../transactions/api.ts";

function transaction(overrides: Partial<PublicTransaction> = {}): PublicTransaction {
  return {
    id: "tx_1",
    referenceNumber: "WB-1",
    status: "ARRIVED",
    arrivedAt: "2026-09-21T00:00:00.000Z",
    completedAt: null,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    exceptionReason: null,
    site: { id: "site", code: "DEMO", name: "Demo" },
    weighbridge: { id: "wb", code: "WB1", name: "WB1" },
    vehicle: {
      id: "v1",
      registrationNumber: "AP39XX1234",
      displayRegistrationNumber: "AP 39 XX 1234",
      vehicleType: "Truck",
      transporterName: null,
    },
    operator: { id: "u1", fullName: "Operator" },
    completedBy: null,
    weighments: [],
    documents: [],
    documentStatus: null,
    material: null,
    supplier: null,
    workflow: null,
    materialSource: null,
    materialIdentification: null,
    suggestion: null,
    nextAction: { code: "identify", label: "Identify vehicle", blocking: true },
    approval: { required: false, departments: [], reason: "" },
    pendingApproval: null,
    approvals: [],
    grossWeightKg: null,
    tareWeightKg: null,
    netWeightKg: null,
    unloading: null,
    instruction: null,
    allowedActions: [],
    timeline: [],
    ...overrides,
  };
}

function user(permissions: string[]): PublicUser {
  return {
    id: "u1",
    fullName: "Operator",
    email: "op@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "d", code: "WEIGHBRIDGE", name: "Weighbridge" },
    defaultSite: { id: "s", code: "DEMO", name: "Demo" },
    roles: [{ id: "r", code: "WEIGHBRIDGE_OPERATOR", name: "Operator", site: null }],
    permissions,
  };
}

describe("driver translations", () => {
  it("selects English, Hindi, and Telugu without hardcoded fallbacks for known keys", () => {
    assert.equal(translate("en", "selectLanguage"), "Select Language");
    assert.equal(translate("hi", "selectLanguage"), "भाषा चुनें");
    assert.equal(translate("te", "selectLanguage"), TE.selectLanguage);
    assert.notEqual(translate("hi", "confirm"), EN.confirm);
  });

  it("falls back to English for an unknown locale", () => {
    assert.equal(translate("fr", "pleaseRepeat"), EN.pleaseRepeat);
  });

  it("keeps Hindi and Telugu catalogs complete", () => {
    const keys = Object.keys(EN) as TranslationKey[];
    for (const key of keys) {
      assert.equal(typeof HI[key], "string");
      assert.ok(HI[key].length > 0);
      assert.equal(typeof TE[key], "string");
      assert.ok(TE[key].length > 0);
    }
  });
});

describe("voice intents", () => {
  it("maps known phrases and rejects unknown speech", () => {
    assert.equal(mapTranscriptToIntent("confirm").intent, "CONFIRM");
    assert.equal(mapTranscriptToIntent("हां").intent, "CONFIRM");
    assert.equal(mapTranscriptToIntent("scan document").intent, "SCAN_DOCUMENT");
    assert.equal(mapTranscriptToIntent("unloading completed").intent, "COMPLETE_UNLOADING");
    assert.equal(mapTranscriptToIntent("please launch the missiles").intent, null);
    assert.equal(mapTranscriptToIntent("please launch the missiles").uncertain, true);
    assert.equal(isDriverIntent("CONFIRM"), true);
    assert.equal(isDriverIntent("DELETE_EVERYTHING"), false);
  });

  it("simulated STT stays local and reports unavailability when no utterance is queued", async () => {
    const stt = new SimulatedSpeechToTextProvider();
    const empty = await stt.listen();
    assert.equal(empty.unavailable, true);
    stt.queueTranscript("next");
    const next = await stt.listen();
    assert.equal(next.intent, "NEXT");
    const tts = new SimulatedTextToSpeechProvider();
    await tts.speak("Vehicle Detected", "en");
    assert.equal(tts.lastSpoken?.text, "Vehicle Detected");
  });
});

describe("driver workflow mapping", () => {
  it("requires language selection before operational screens", () => {
    assert.equal(resolveDriverScreen({ languageChosen: false, transaction: null }), "LANGUAGE");
  });

  it("maps existing nextAction codes instead of inventing a second state machine", () => {
    assert.equal(resolveDriverScreen({ languageChosen: true, transaction: transaction() }), "VEHICLE");
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "IDENTIFIED", nextAction: { code: "upload_document", label: "Upload", blocking: false } }),
      }),
      "DOCUMENT",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({
          status: "IDENTIFIED",
          nextAction: { code: "upload_document", label: "Upload", blocking: false },
        }),
        skippedOptionalDocument: true,
      }),
      "FIRST_WEIGHMENT",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "PENDING_APPROVAL", nextAction: { code: "await_approval", label: "Wait", blocking: true } }),
      }),
      "APPROVAL",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "UNLOADING", nextAction: { code: "complete_unloading", label: "Done", blocking: true } }),
      }),
      "UNLOADING_PROGRESS",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "UNLOADED", nextAction: { code: "record_tare", label: "Tare", blocking: true } }),
      }),
      "SECOND_WEIGHMENT",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "COMPLETED", nextAction: { code: "completed", label: "Done", blocking: false } }),
      }),
      "COMPLETED",
    );
    assert.equal(
      resolveDriverScreen({
        languageChosen: true,
        transaction: transaction({ status: "EXCEPTION", nextAction: { code: "review_exception", label: "Review", blocking: true } }),
      }),
      "EXCEPTION",
    );
  });

  it("keeps progress labels at the seven driver steps", () => {
    assert.equal(progressStepForScreen("DOCUMENT"), "DOCUMENT");
    assert.equal(progressStepForScreen("UNLOADING_PROGRESS"), "UNLOADING");
    assert.equal(progressStepForScreen("LANGUAGE"), "VEHICLE");
  });
});

describe("driver errors and exceptions", () => {
  it("hides raw backend errors", () => {
    assert.equal(friendlyDriverErrorKey({ status: 409, message: "HTTP 409 Prisma transaction state conflict" }), "transactionUpdatedRefresh");
    assert.equal(friendlyDriverErrorKey({ status: 504, message: "WEIGHT_PROVIDER_TIMEOUT" }), "weightUnavailable");
    assert.equal(friendlyDriverErrorKey({ status: 403, message: "AUTHORIZATION_ERROR" }), "notAuthorized");
    assert.equal(friendlyDriverErrorKey({ status: 500, message: "Something went wrong. Please contact the administrator." }), "genericError");
    assert.equal(exceptionCopy(transaction({ status: "REJECTED", nextAction: { code: "blocked", label: "Blocked", blocking: true } })).bodyKey, "approvalNotGranted");
    assert.equal(exceptionCopy(transaction({ status: "EXCEPTION", nextAction: { code: "review_exception", label: "Review", blocking: true } })).bodyKey, "unusualWeight");
    assert.equal(weightStatusKey("STABLE"), "weightStable");
    assert.equal(weightStatusKey("UNSTABLE"), "weightUnstable");
  });
});

describe("offline display and rules", () => {
  it("maps Step 17 sync snapshots to driver connectivity tones", () => {
    assert.equal(resolveConnectivityTone({ navigatorOnline: false, fetchFailed: false }), "OFFLINE");
    assert.equal(resolveConnectivityTone({ navigatorOnline: true, fetchFailed: true }), "OFFLINE");
    assert.equal(
      resolveConnectivityTone({
        navigatorOnline: true,
        fetchFailed: false,
        internetStatus: "ONLINE",
        backendStatus: "REACHABLE",
        syncStatus: "SYNCING",
      }),
      "SYNCING",
    );
    assert.equal(
      resolveConnectivityTone({
        navigatorOnline: true,
        fetchFailed: false,
        internetStatus: "ONLINE",
        backendStatus: "REACHABLE",
        syncStatus: "IDLE",
        queued: 0,
      }),
      "SYNCED",
    );
    assert.equal(connectivityLabelKey("OFFLINE"), "offlineSaved");
  });

  it("never lets offline mode decide approvals or finalize", () => {
    assert.equal(driverOfflineGuidance("APPROVAL", false)?.allowed, false);
    assert.equal(driverOfflineGuidance("FINALIZE", false)?.allowed, false);
    assert.equal(driverOfflineGuidance("APPROVAL", true), null);
    assert.equal(driverOfflineGuidance("BASIC", false), null);
  });
});

describe("session safety and permissions", () => {
  it("requires confirmation before switching transactions", () => {
    assert.equal(shouldConfirmTransactionSwitch("tx_1", "tx_2"), true);
    assert.equal(shouldConfirmTransactionSwitch("tx_1", "tx_1"), false);
    assert.equal(shouldConfirmTransactionSwitch(null, "tx_2"), false);
  });

  it("restricts driver mode to the dedicated permission", () => {
    assert.equal(hasPermission(user(["driver.mode"]), "driver.mode"), true);
    assert.equal(hasPermission(user(["transaction.read", "approval.decide"]), "driver.mode"), false);
    assert.equal(hasPermission(user(["driver.mode"]), "user.manage", "workflow.manage"), false);
  });
});

describe("audio abstraction", () => {
  it("records simulated cues without an external service", async () => {
    const audio = new SimulatedAudioFeedbackProvider();
    await audio.play("VEHICLE_DETECTED");
    assert.equal(audio.lastCue, "VEHICLE_DETECTED");
    assert.ok(AUDIO_CUES.includes("TRANSACTION_COMPLETED"));
  });
});
