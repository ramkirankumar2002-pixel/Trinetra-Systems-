import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import {
  confirmIdentification,
  correctDetection,
  manualIdentify,
  recognizeCamera,
  type PublicIdentification,
} from "../cameras/api.ts";
import { processDocument, uploadTransactionDocument } from "../documents/api.ts";
import { listSyncStatus, type PublicSyncSnapshot } from "../sync/api.ts";
import {
  assignTransactionMaterial,
  assignUnloading,
  completeUnloading,
  createArrival,
  finalizeTransaction,
  getTransaction,
  recordWeighmentFromDevice,
  startUnloading,
  verifyTransactionMaterial,
  type PublicTransaction,
} from "../transactions/api.ts";
import { createVehicle, lookupVehicle } from "../vehicles/api.ts";
import { getLiveWeight, type LiveWeightResponse, type PublicWeighbridge } from "../weighbridge/api.ts";
import { getDriverContext, recordDriverEvent, type DriverContext } from "./api.ts";
import { createAudioFeedbackService } from "./audio.ts";
import {
  ApprovalScreen,
  CompletedScreen,
  DocumentScreen,
  DriverProgress,
  DuplicateDialog,
  ExceptionScreen,
  LanguageScreen,
  MaterialScreen,
  SwitchDialog,
  UnloadingProgressScreen,
  UnloadingScreen,
  VehicleScreen,
  WeighmentScreen,
} from "./DriverScreens.tsx";
import { createTranslator } from "./i18n.ts";
import {
  readActiveTransactionId,
  readDriverPreferences,
  writeActiveTransactionId,
  writeDriverPreferences,
} from "./preferences.ts";
import { DRIVER_LOCALES } from "./translations.ts";
import { createVoiceService, type DriverIntent } from "./voice.ts";
import {
  connectivityLabelKey,
  driverOfflineGuidance,
  friendlyDriverErrorKey,
  helpKeyForScreen,
  resolveConnectivityTone,
  resolveDriverScreen,
  shouldConfirmTransactionSwitch,
  simulatedInvoiceFile,
} from "./workflow.ts";

export function DriverModePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefs, setPrefs] = useState(() => readDriverPreferences());
  const [context, setContext] = useState<DriverContext | null>(null);
  const [transaction, setTransaction] = useState<PublicTransaction | null>(null);
  const [identification, setIdentification] = useState<PublicIdentification | null>(null);
  const [plate, setPlate] = useState("");
  const [editingPlate, setEditingPlate] = useState(false);
  const [skippedDocument, setSkippedDocument] = useState(false);
  const [live, setLive] = useState<LiveWeightResponse | null>(null);
  const [sync, setSync] = useState<PublicSyncSnapshot | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [errorKey, setErrorKey] = useState<ReturnType<typeof friendlyDriverErrorKey> | null>(null);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingSwitchId, setPendingSwitchId] = useState<string | null>(null);
  const audioRef = useRef(createAudioFeedbackService(prefs.audioEnabled));
  const voiceRef = useRef(createVoiceService({ locale: prefs.language }));
  const lastActionRef = useRef<string>("");

  const t = useMemo(() => createTranslator(prefs.language), [prefs.language]);
  const weighbridge = pickWeighbridge(context?.weighbridges ?? [], transaction);
  const cameraId = weighbridge?.camera?.id ?? "";
  const online = resolveConnectivityTone({
    navigatorOnline: typeof navigator === "undefined" ? true : navigator.onLine,
    fetchFailed: syncFailed,
    internetStatus: sync?.internetStatus,
    backendStatus: sync?.backendStatus,
    syncStatus: sync?.syncStatus,
    lastError: sync?.lastError,
    queued: sync?.queued,
  });
  const connected = online === "ONLINE" || online === "SYNCED" || online === "SYNCING";
  const screen = resolveDriverScreen({
    languageChosen: prefs.languageChosen,
    transaction,
    skippedOptionalDocument: skippedDocument,
  });

  const persistPrefs = useCallback((next: typeof prefs) => {
    setPrefs(next);
    writeDriverPreferences(next);
    audioRef.current.setEnabled(next.audioEnabled);
  }, []);

  const attachTransaction = useCallback((next: PublicTransaction) => {
    setTransaction(next);
    writeActiveTransactionId(next.id);
    setSearchParams({ transactionId: next.id }, { replace: true });
  }, [setSearchParams]);

  const fail = useCallback((caught: unknown) => {
    console.error("Driver mode action failed", caught);
    setErrorKey(friendlyDriverErrorKey(caught));
    void audioRef.current.play("ERROR_DETECTED");
  }, []);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      setBusy(true);
      setErrorKey(null);
      try {
        await action();
      } catch (caught) {
        fail(caught);
      } finally {
        setBusy(false);
      }
    },
    [fail],
  );

  const refreshTransaction = useCallback(
    async (id: string) => {
      const result = await getTransaction(id);
      setTransaction(result.transaction);
      writeActiveTransactionId(result.transaction.id);
    },
    [],
  );

  useEffect(() => {
    void recordDriverEvent("DRIVER_MODE_OPENED");
    void getDriverContext()
      .then((loaded) => {
        setContext(loaded);
        const fallback = loaded.config.defaultLanguage;
        if (!prefs.languageChosen) {
          persistPrefs({ ...prefs, language: fallback, voiceEnabled: loaded.config.voiceEnabled && prefs.voiceEnabled, audioEnabled: loaded.config.audioEnabled && prefs.audioEnabled });
        }
        const requested = searchParams.get("transactionId");
        const sessionId = readActiveTransactionId();
        if (requested && sessionId && shouldConfirmTransactionSwitch(sessionId, requested)) {
          setPendingSwitchId(requested);
          return;
        }
        const resumeId = requested ?? sessionId ?? loaded.openTransactions[0]?.id ?? null;
        if (resumeId) {
          void refreshTransaction(resumeId).catch(fail);
        }
      })
      .catch(fail);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listSyncStatus()
      .then((result) => {
        if (!cancelled) {
          setSync(result.items[0] ?? null);
          setSyncFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [transaction?.id, screen]);

  useEffect(() => {
    if (!weighbridge || (screen !== "FIRST_WEIGHMENT" && screen !== "SECOND_WEIGHMENT")) {
      return;
    }
    const weighbridgeId = weighbridge.id;
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const reading = await getLiveWeight(weighbridgeId);
        if (!cancelled) {
          setLive(reading);
          if (reading.reading.quality === "STABLE") {
            void audioRef.current.play("WEIGHMENT_STABLE");
          }
        }
      } catch (caught) {
        if (!cancelled) {
          fail(caught);
        }
      }
    }
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weighbridge, screen, fail]);

  useEffect(() => {
    if (!transaction || (screen !== "APPROVAL" && screen !== "DOCUMENT" && screen !== "UNLOADING")) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshTransaction(transaction.id).catch(fail);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [transaction, screen, refreshTransaction, fail]);

  useEffect(() => {
    if (!transaction) {
      return;
    }
    if (transaction.nextAction.code !== lastActionRef.current && lastActionRef.current === "await_approval") {
      void audioRef.current.play("APPROVAL_RECEIVED");
    }
    lastActionRef.current = transaction.nextAction.code;
  }, [transaction]);

  async function detectVehicle(): Promise<void> {
    if (cameraId === "") {
      setErrorKey("noWeighbridge");
      return;
    }
    await run(async () => {
      const result = await recognizeCamera(cameraId);
      setIdentification(result.identification);
      setPlate(result.identification.detection.displayPlate ?? "");
      void audioRef.current.play("VEHICLE_DETECTED");
      void voiceRef.current.tts.speak(t("vehicleDetected"), prefs.language);
    });
  }

  async function confirmVehicle(): Promise<void> {
    const vehicle = identification?.vehicle;
    const detection = identification?.detection;
    if (!vehicle || !detection || cameraId === "") {
      await registerOrLookup();
      return;
    }
    const open = context?.openTransactions[0];
    if (open && !transaction) {
      setDuplicateOpen(true);
      return;
    }
    await run(async () => {
      const result = await confirmIdentification(cameraId, detection.id, vehicle.id);
      const id = result.identification.detection.transactionId;
      void recordDriverEvent("DRIVER_VEHICLE_CONFIRMED", id ?? "session");
      if (id) {
        await refreshTransaction(id);
      }
    });
  }

  async function registerOrLookup(): Promise<void> {
    const value = plate.trim();
    if (value === "" || !weighbridge) {
      setErrorKey("vehicleNotDetected");
      return;
    }
    const open = context?.openTransactions[0];
    if (open && !transaction) {
      setDuplicateOpen(true);
      return;
    }
    if (!hasPermission(user, "transaction.create")) {
      setErrorKey("notAuthorized");
      return;
    }
    await run(async () => {
      if (cameraId !== "" && identification?.detection && editingPlate) {
        const corrected = await correctDetection(cameraId, identification.detection.id, value, "Driver correction");
        setIdentification(corrected.identification);
      }
      let vehicleId = identification?.vehicle?.id ?? null;
      if (!vehicleId) {
        const found = await lookupVehicle(value);
        vehicleId = found.vehicle?.id ?? null;
      }
      if (!vehicleId) {
        const created = await createVehicle({ registrationNumber: value, displayRegistrationNumber: value });
        vehicleId = created.vehicle.id;
      }
      if (cameraId !== "") {
        const identified = await manualIdentify(cameraId, value);
        setIdentification(identified.identification);
        if (identified.identification.vehicle) {
          const confirmed = await confirmIdentification(
            cameraId,
            identified.identification.detection.id,
            identified.identification.vehicle.id,
          );
          const id = confirmed.identification.detection.transactionId;
          if (id) {
            void recordDriverEvent("DRIVER_VEHICLE_CONFIRMED", id);
            await refreshTransaction(id);
            return;
          }
        }
      }
      const created = await createArrival(weighbridge.id, vehicleId);
      void recordDriverEvent("DRIVER_VEHICLE_CONFIRMED", created.transaction.id);
      attachTransaction(created.transaction);
    });
  }

  async function uploadDocument(file: File): Promise<void> {
    if (!transaction) {
      return;
    }
    await run(async () => {
      void recordDriverEvent("DRIVER_DOCUMENT_SCAN_REQUESTED", transaction.id);
      const uploaded = await uploadTransactionDocument(transaction.id, file, "INVOICE");
      await processDocument(
        uploaded.document.id,
        transaction.vehicle?.registrationNumber
          ? { anprVehicleNumber: transaction.vehicle.registrationNumber }
          : {},
      );
      await refreshTransaction(transaction.id);
      void audioRef.current.play("DOCUMENT_CAPTURED");
      void voiceRef.current.tts.speak(t("documentCaptured"), prefs.language);
    });
  }

  async function handleIntent(intent: DriverIntent): Promise<void> {
    switch (intent) {
      case "HELP":
        setHelpOpen(true);
        return;
      case "BACK":
        setSettingsOpen(false);
        setHelpOpen(false);
        if (screen === "DOCUMENT" && skippedDocument) {
          setSkippedDocument(false);
        }
        return;
      case "CANCEL":
        setHelpOpen(false);
        setDuplicateOpen(false);
        setPendingSwitchId(null);
        return;
      case "RETRY":
        setErrorKey(null);
        if (screen === "VEHICLE") {
          await detectVehicle();
        }
        if (transaction) {
          await refreshTransaction(transaction.id).catch(fail);
        }
        return;
      case "SCAN_DOCUMENT":
        await uploadDocument(simulatedInvoiceFile());
        return;
      case "START_TRANSACTION":
        if (context?.openTransactions[0] && !transaction) {
          setDuplicateOpen(true);
          return;
        }
        await detectVehicle();
        return;
      case "COMPLETE_UNLOADING":
        if (transaction) {
          await run(async () => {
            const result = await completeUnloading(transaction.id);
            void recordDriverEvent("DRIVER_UNLOADING_COMPLETED", transaction.id);
            attachTransaction(result.transaction);
          });
        }
        return;
      case "NEXT":
      case "CONFIRM":
        await handlePrimary();
        return;
      default: {
        const exhaustive: never = intent;
        return exhaustive;
      }
    }
  }

  async function handlePrimary(): Promise<void> {
    if (!transaction) {
      await confirmVehicle();
      return;
    }
    void recordDriverEvent("DRIVER_WORKFLOW_ACTION", transaction.id, { action: transaction.nextAction.code });
    switch (screen) {
      case "LANGUAGE":
        return;
      case "VEHICLE":
        await confirmVehicle();
        return;
      case "DOCUMENT":
        await uploadDocument(simulatedInvoiceFile());
        return;
      case "MATERIAL":
        await run(async () => {
          if (transaction.nextAction.code === "assign_material" && transaction.suggestion?.material) {
            const result = await assignTransactionMaterial(transaction.id, {
              materialId: transaction.suggestion.material.id,
              source: "OCR",
              ...(transaction.documents[0] ? { documentId: transaction.documents[0].id } : {}),
            });
            attachTransaction(result.transaction);
            return;
          }
          if (transaction.nextAction.code === "verify_material") {
            const result = await verifyTransactionMaterial(transaction.id);
            attachTransaction(result.transaction);
          }
        });
        return;
      case "FIRST_WEIGHMENT":
        await run(async () => {
          const result = await recordWeighmentFromDevice(transaction.id, "GROSS");
          attachTransaction(result.transaction);
        });
        return;
      case "APPROVAL":
        setErrorKey("offlineApprovalBlocked");
        return;
      case "UNLOADING":
        await run(async () => {
          if (transaction.nextAction.code === "assign_unloading") {
            const assigned = await assignUnloading(transaction.id);
            attachTransaction(assigned.transaction);
            void audioRef.current.play("UNLOADING_ASSIGNED");
            return;
          }
          const started = await startUnloading(transaction.id);
          void recordDriverEvent("DRIVER_UNLOADING_STARTED", transaction.id);
          attachTransaction(started.transaction);
        });
        return;
      case "UNLOADING_PROGRESS":
        await handleIntent("COMPLETE_UNLOADING");
        return;
      case "SECOND_WEIGHMENT":
        await run(async () => {
          if (transaction.nextAction.code === "record_tare") {
            const weighed = await recordWeighmentFromDevice(transaction.id, "TARE");
            attachTransaction(weighed.transaction);
            return;
          }
          const offline = driverOfflineGuidance("FINALIZE", connected);
          if (offline && !offline.allowed) {
            setErrorKey(offline.messageKey);
            return;
          }
          const done = await finalizeTransaction(transaction.id);
          void recordDriverEvent("DRIVER_TRANSACTION_COMPLETED", transaction.id);
          attachTransaction(done.transaction);
          void audioRef.current.play("TRANSACTION_COMPLETED");
        });
        return;
      case "COMPLETED":
        writeActiveTransactionId(null);
        navigate("/weighbridge");
        return;
      case "EXCEPTION":
        await refreshTransaction(transaction.id).catch(fail);
        return;
      default: {
        const exhaustive: never = screen;
        return exhaustive;
      }
    }
  }

  async function listenVoice(): Promise<void> {
    if (!prefs.voiceEnabled || !context?.config.voiceEnabled) {
      setVoiceMessage(t("voiceUnavailable"));
      return;
    }
    setVoiceMessage(t("listening"));
    const result = await voiceRef.current.stt.listen();
    if (result.unavailable) {
      setVoiceMessage(t("voiceUnavailable"));
      return;
    }
    if (result.uncertain || result.intent === null) {
      setVoiceMessage(t("pleaseRepeat"));
      void recordDriverEvent("DRIVER_VOICE_REJECTED", transaction?.id ?? "session");
      return;
    }
    setVoiceMessage(null);
    void recordDriverEvent("DRIVER_VOICE_ACCEPTED", transaction?.id ?? "session", { intent: result.intent });
    await handleIntent(result.intent);
  }

  const canAssignMaterial =
    hasPermission(user, "transaction.update", "transaction.create") &&
    Boolean(transaction?.suggestion?.material || transaction?.material);
  const canVerifyMaterial = hasPermission(user, "transaction.update", "document.verify");
  const canAssignUnload = hasPermission(user, "unloading.assign");
  const canStartUnload = hasPermission(user, "unloading.manage");

  if (context && !context.config.driverModeEnabled) {
    return (
      <main className="driver-shell">
        <p>{t("driverModeDisabled")}</p>
        <Link to="/weighbridge" className="driver-button">
          {t("exit")}
        </Link>
      </main>
    );
  }

  return (
    <main className="driver-shell">
      <header className="driver-topbar">
        <p className="driver-kicker">{t("appTitle")}</p>
        <p className={`driver-connectivity driver-connectivity-${online.toLowerCase()}`} role="status">
          {t(connectivityLabelKey(online))}
        </p>
        <div className="driver-top-actions">
          <button type="button" className="driver-icon-button" onClick={() => setHelpOpen(true)}>
            {t("help")}
          </button>
          <button type="button" className="driver-icon-button" onClick={() => setSettingsOpen((open) => !open)}>
            {t("settings")}
          </button>
          <Link to="/weighbridge" className="driver-icon-button">
            {t("exit")}
          </Link>
        </div>
      </header>

      {transaction ? (
        <aside className="driver-context" aria-live="polite">
          <p>
            <span>{t("vehicleNumber")}</span> {transaction.vehicle?.displayRegistrationNumber ?? "—"}
          </p>
          <p>
            <span>{t("transactionId")}</span> {transaction.referenceNumber}
          </p>
          <p>
            <span>{t("material")}</span> {transaction.material?.name ?? "—"}
          </p>
          <p>
            <span>{t("currentStep")}</span> {t(helpKeyForScreen(screen))}
          </p>
        </aside>
      ) : null}

      {prefs.languageChosen ? <DriverProgress t={t} screen={screen} /> : null}

      {errorKey ? (
        <p className="driver-error" role="alert">
          {t(errorKey)}
        </p>
      ) : null}
      {voiceMessage ? (
        <p className="driver-voice" role="status">
          {voiceMessage}
        </p>
      ) : null}

      {screen === "LANGUAGE" ? (
        <LanguageScreen
          t={t}
          languages={context?.config.languages ?? [...DRIVER_LOCALES]}
          onSelect={(locale) => {
            persistPrefs({ ...prefs, language: locale, languageChosen: true });
            voiceRef.current = createVoiceService({ locale });
            void recordDriverEvent("DRIVER_LANGUAGE_CHANGED", "session", { language: locale });
            void createVoiceService({ locale }).tts.speak(t("chooseLanguage"), locale);
          }}
        />
      ) : null}

      {screen === "VEHICLE" ? (
        <VehicleScreen
          t={t}
          busy={busy}
          identification={identification}
          plate={plate}
          onPlateChange={setPlate}
          onDetect={() => void detectVehicle()}
          onConfirm={() => void confirmVehicle()}
          onRegister={() => void registerOrLookup()}
          editing={editingPlate}
          onEdit={() => setEditingPlate(true)}
        />
      ) : null}

      {screen === "DOCUMENT" && transaction ? (
        <DocumentScreen
          t={t}
          busy={busy}
          transaction={transaction}
          onScan={() => void uploadDocument(simulatedInvoiceFile())}
          onSkip={() => setSkippedDocument(true)}
          onPickFile={(file) => void uploadDocument(file)}
        />
      ) : null}

      {screen === "MATERIAL" && transaction ? (
        <MaterialScreen
          t={t}
          busy={busy}
          transaction={transaction}
          canConfirm={transaction.nextAction.code === "assign_material" ? canAssignMaterial : canVerifyMaterial}
          onConfirm={() => void handlePrimary()}
        />
      ) : null}

      {screen === "FIRST_WEIGHMENT" && transaction ? (
        <WeighmentScreen
          t={t}
          busy={busy}
          titleKey="firstWeighment"
          instructionKey="firstWeighment"
          transaction={transaction}
          live={live}
          actionKey="recordWeight"
          onRecord={() => void handlePrimary()}
        />
      ) : null}

      {screen === "APPROVAL" && transaction ? <ApprovalScreen t={t} transaction={transaction} /> : null}

      {screen === "UNLOADING" && transaction ? (
        <UnloadingScreen
          t={t}
          busy={busy}
          transaction={transaction}
          canAssign={canAssignUnload}
          canStart={canStartUnload}
          onAssign={() => void handlePrimary()}
          onStart={() => void handlePrimary()}
        />
      ) : null}

      {screen === "UNLOADING_PROGRESS" && transaction ? (
        <UnloadingProgressScreen
          t={t}
          busy={busy}
          transaction={transaction}
          onComplete={() => void handleIntent("COMPLETE_UNLOADING")}
        />
      ) : null}

      {screen === "SECOND_WEIGHMENT" && transaction ? (
        <WeighmentScreen
          t={t}
          busy={busy}
          titleKey="secondWeighment"
          instructionKey="returnForFinalWeigh"
          transaction={transaction}
          live={live}
          actionKey={transaction.nextAction.code === "finalize" ? "finishTransaction" : "recordFinalWeight"}
          onRecord={() => void handlePrimary()}
        />
      ) : null}

      {screen === "COMPLETED" && transaction ? (
        <CompletedScreen t={t} transaction={transaction} onDone={() => void handlePrimary()} />
      ) : null}

      {screen === "EXCEPTION" && transaction ? (
        <ExceptionScreen
          t={t}
          transaction={transaction}
          onRetry={() => void handleIntent("RETRY")}
          onAcknowledge={() => {
            void recordDriverEvent("DRIVER_EXCEPTION_ACKNOWLEDGED", transaction.id);
          }}
        />
      ) : null}

      <footer className="driver-footer">
        <button type="button" className="driver-button driver-button-secondary" onClick={() => void listenVoice()} disabled={busy}>
          {t("speak")}
        </button>
      </footer>

      {helpOpen ? (
        <div className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="driver-help-title">
          <h2 id="driver-help-title">{t("help")}</h2>
          <p>{t(helpKeyForScreen(screen))}</p>
          <button type="button" className="driver-button" onClick={() => setHelpOpen(false)}>
            {t("closeHelp")}
          </button>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="driver-settings-title">
          <h2 id="driver-settings-title">{t("settings")}</h2>
          <div className="driver-actions">
            {(context?.config.languages ?? [...DRIVER_LOCALES]).map((locale) => (
              <button
                key={locale}
                type="button"
                className="driver-button driver-button-secondary"
                onClick={() => {
                  persistPrefs({ ...prefs, language: locale, languageChosen: true });
                  void recordDriverEvent("DRIVER_LANGUAGE_CHANGED", "session", { language: locale });
                }}
              >
                {locale.toUpperCase()}
              </button>
            ))}
            <button
              type="button"
              className="driver-button"
              onClick={() => persistPrefs({ ...prefs, voiceEnabled: !prefs.voiceEnabled })}
            >
              {prefs.voiceEnabled ? t("voiceOn") : t("voiceOff")}
            </button>
            <button
              type="button"
              className="driver-button"
              onClick={() => {
                persistPrefs({ ...prefs, audioEnabled: !prefs.audioEnabled });
                void recordDriverEvent("DRIVER_AUDIO_TOGGLED", "session", { enabled: !prefs.audioEnabled });
              }}
            >
              {prefs.audioEnabled ? t("audioOn") : t("audioOff")}
            </button>
            <button type="button" className="driver-button driver-button-secondary" onClick={() => setSettingsOpen(false)}>
              {t("closeHelp")}
            </button>
          </div>
        </div>
      ) : null}

      {duplicateOpen ? (
        <DuplicateDialog
          t={t}
          onContinue={() => {
            const id = context?.openTransactions[0]?.id;
            setDuplicateOpen(false);
            if (id) {
              void refreshTransaction(id).catch(fail);
            }
          }}
          onCancel={() => setDuplicateOpen(false)}
        />
      ) : null}

      {pendingSwitchId ? (
        <SwitchDialog
          t={t}
          onConfirm={() => {
            const id = pendingSwitchId;
            setPendingSwitchId(null);
            void refreshTransaction(id).catch(fail);
          }}
          onCancel={() => setPendingSwitchId(null)}
        />
      ) : null}
    </main>
  );
}

function pickWeighbridge(
  weighbridges: PublicWeighbridge[],
  transaction: PublicTransaction | null,
): PublicWeighbridge | undefined {
  if (transaction?.weighbridge) {
    return weighbridges.find((item) => item.id === transaction.weighbridge?.id) ?? weighbridges[0];
  }
  return weighbridges[0];
}
