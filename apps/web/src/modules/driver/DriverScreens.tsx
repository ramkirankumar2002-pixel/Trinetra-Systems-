import type { PublicIdentification } from "../cameras/api.ts";
import type { PublicTransaction } from "../transactions/api.ts";
import type { LiveWeightResponse } from "../weighbridge/api.ts";
import { formatKg } from "../../shared/ui/StatusPill.tsx";
import type { TranslationKey } from "./translations.ts";
import { DRIVER_LOCALES, localeLabelKey, type DriverLocale } from "./translations.ts";
import {
  DRIVER_PROGRESS_STEPS,
  exceptionCopy,
  progressLabelKey,
  progressStepForScreen,
  weightStatusKey,
  type DriverProgressStep,
  type DriverScreen,
} from "./workflow.ts";

type Translate = (key: TranslationKey) => string;

type CommonProps = {
  t: Translate;
  busy: boolean;
};

export function DriverProgress({
  t,
  screen,
}: {
  t: Translate;
  screen: DriverScreen;
}) {
  const current = progressStepForScreen(screen);
  return (
    <ol className="driver-progress" aria-label={t("currentStep")}>
      {DRIVER_PROGRESS_STEPS.map((step, index) => {
        const state = stepState(step, current);
        return (
          <li key={step} className={`driver-progress-step driver-progress-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="driver-progress-index">{index + 1}</span>
            <span>{t(progressLabelKey(step))}</span>
          </li>
        );
      })}
    </ol>
  );
}

function stepState(step: DriverProgressStep, current: DriverProgressStep): "done" | "current" | "upcoming" {
  const currentIndex = DRIVER_PROGRESS_STEPS.indexOf(current);
  const stepIndex = DRIVER_PROGRESS_STEPS.indexOf(step);
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "current";
  }
  return "upcoming";
}

export function LanguageScreen({
  t,
  languages,
  onSelect,
}: {
  t: Translate;
  languages: DriverLocale[];
  onSelect: (locale: DriverLocale) => void;
}) {
  const available = languages.length > 0 ? languages : [...DRIVER_LOCALES];
  return (
    <section className="driver-panel" aria-labelledby="driver-language-title">
      <h1 id="driver-language-title">{t("chooseLanguage")}</h1>
      <p className="driver-instruction">{t("selectLanguage")}</p>
      <div className="driver-actions">
        {available.map((locale) => (
          <button key={locale} type="button" className="driver-button" onClick={() => onSelect(locale)}>
            {t(localeLabelKey(locale))}
          </button>
        ))}
      </div>
    </section>
  );
}

export function VehicleScreen({
  t,
  busy,
  identification,
  plate,
  onPlateChange,
  onDetect,
  onConfirm,
  onRegister,
  editing,
  onEdit,
}: CommonProps & {
  identification: PublicIdentification | null;
  plate: string;
  onPlateChange: (value: string) => void;
  onDetect: () => void;
  onConfirm: () => void;
  onRegister: () => void;
  editing: boolean;
  onEdit: () => void;
}) {
  const vehicle = identification?.vehicle ?? null;
  const detection = identification?.detection ?? null;
  const confidence =
    detection?.confidence === null || detection?.confidence === undefined
      ? "—"
      : `${Math.round(detection.confidence * 100)}%`;

  return (
    <section className="driver-panel" aria-labelledby="driver-vehicle-title">
      <h1 id="driver-vehicle-title">{vehicle ? t("vehicleDetected") : t("enterVehicleNumber")}</h1>
      <p className="driver-instruction">{t("pleaseConfirm")}</p>
      <p className="driver-plate" aria-live="polite">
        {detection?.displayPlate ?? plate ?? "—"}
      </p>
      {detection ? (
        <p>
          {t("confidence")}: {confidence}
        </p>
      ) : null}
      {editing || !vehicle ? (
        <label className="driver-field">
          <span>{t("vehicleNumber")}</span>
          <input
            value={plate}
            onChange={(event) => onPlateChange(event.target.value)}
            autoComplete="off"
            inputMode="text"
          />
        </label>
      ) : null}
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onDetect} disabled={busy}>
          {t("capturePlate")}
        </button>
        {vehicle && !editing ? (
          <>
            <button type="button" className="driver-button" onClick={onConfirm} disabled={busy}>
              {t("confirm")}
            </button>
            <button type="button" className="driver-button driver-button-secondary" onClick={onEdit} disabled={busy}>
              {t("edit")}
            </button>
          </>
        ) : (
          <button type="button" className="driver-button" onClick={onRegister} disabled={busy || plate.trim() === ""}>
            {vehicle ? t("confirm") : t("registerVehicle")}
          </button>
        )}
      </div>
    </section>
  );
}

export function DocumentScreen({
  t,
  busy,
  transaction,
  onScan,
  onSkip,
  onPickFile,
}: CommonProps & {
  transaction: PublicTransaction;
  onScan: () => void;
  onSkip: () => void;
  onPickFile: (file: File) => void;
}) {
  const uploaded = transaction.documents.length > 0;
  const needsVerify = transaction.nextAction.blocking && transaction.nextAction.code === "upload_document" && uploaded;
  return (
    <section className="driver-panel" aria-labelledby="driver-document-title">
      <h1 id="driver-document-title">{uploaded ? t("documentCaptured") : t("scanDocument")}</h1>
      <p className="driver-instruction">{needsVerify ? t("documentNeedsVerification") : t("scanInstruction")}</p>
      {needsVerify ? null : (
        <div className="driver-actions">
          <button type="button" className="driver-button" onClick={onScan} disabled={busy}>
            {t("scanDocument")}
          </button>
          <label className="driver-file-hidden">
            <span className="visually-hidden">{t("scanDocument")}</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onPickFile(file);
                }
              }}
            />
          </label>
          {!transaction.nextAction.blocking ? (
            <button type="button" className="driver-button driver-button-secondary" onClick={onSkip} disabled={busy}>
              {t("skipManualReview")}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function MaterialScreen({
  t,
  busy,
  transaction,
  canConfirm,
  onConfirm,
}: CommonProps & {
  transaction: PublicTransaction;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const name = transaction.material?.name ?? transaction.suggestion?.material?.name ?? transaction.suggestion?.ocrMaterialName;
  const needsOfficer = transaction.nextAction.code === "verify_material" && !canConfirm;
  return (
    <section className="driver-panel" aria-labelledby="driver-material-title">
      <h1 id="driver-material-title">{t("materialLabel")}</h1>
      <p className="driver-plate">{name ?? "—"}</p>
      <p className="driver-instruction">{needsOfficer ? t("waitStoreOfficer") : t("pleaseConfirm")}</p>
      {canConfirm && name ? (
        <div className="driver-actions">
          <button type="button" className="driver-button" onClick={onConfirm} disabled={busy}>
            {t("confirmMaterial")}
          </button>
        </div>
      ) : (
        <p>{t("waitForOfficer")}</p>
      )}
    </section>
  );
}

export function WeighmentScreen({
  t,
  busy,
  titleKey,
  instructionKey,
  transaction,
  live,
  actionKey,
  onRecord,
}: CommonProps & {
  titleKey: TranslationKey;
  instructionKey: TranslationKey;
  transaction: PublicTransaction;
  live: LiveWeightResponse | null;
  actionKey: TranslationKey;
  onRecord: () => void;
}) {
  const quality = live?.reading.quality ?? "NO_DATA";
  const weight = live?.reading.weightKg ? formatKg(live.reading.weightKg) : "—";
  return (
    <section className="driver-panel" aria-labelledby="driver-weigh-title">
      <h1 id="driver-weigh-title">{t(titleKey)}</h1>
      <p className="driver-instruction">{t(instructionKey)}</p>
      <dl className="driver-facts">
        <div>
          <dt>{t("vehicleNumber")}</dt>
          <dd>{transaction.vehicle?.displayRegistrationNumber ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("materialLabel")}</dt>
          <dd>{transaction.material?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("currentWeight")}</dt>
          <dd className="driver-plate">{weight}</dd>
        </div>
        <div>
          <dt>{t("weightStatus")}</dt>
          <dd>
            <span className={`driver-status driver-status-${quality.toLowerCase()}`}>{t(weightStatusKey(quality))}</span>
          </dd>
        </div>
      </dl>
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onRecord} disabled={busy}>
          {t(actionKey)}
        </button>
      </div>
    </section>
  );
}

export function ApprovalScreen({ t, transaction }: { t: Translate; transaction: PublicTransaction }) {
  const department = transaction.pendingApproval?.department.name;
  return (
    <section className="driver-panel" aria-labelledby="driver-approval-title">
      <h1 id="driver-approval-title">{t("approvalRequired")}</h1>
      <p className="driver-instruction">{t("waitForApproval")}</p>
      <p>{department ? `${t("waitForOfficer")} (${department})` : t("contactStoreOfficer")}</p>
    </section>
  );
}

export function UnloadingScreen({
  t,
  busy,
  transaction,
  canAssign,
  canStart,
  onAssign,
  onStart,
}: CommonProps & {
  transaction: PublicTransaction;
  canAssign: boolean;
  canStart: boolean;
  onAssign: () => void;
  onStart: () => void;
}) {
  const point = transaction.unloading?.point;
  return (
    <section className="driver-panel" aria-labelledby="driver-unload-title">
      <h1 id="driver-unload-title">{t("proceedToUnloading")}</h1>
      {point ? (
        <>
          <p className="driver-instruction">{t("unloadingPoint")}</p>
          <p className="driver-plate">
            {point.name} / {point.code}
          </p>
        </>
      ) : (
        <p className="driver-instruction">{canAssign ? t("pleaseConfirm") : t("waitUnloadingAssign")}</p>
      )}
      <div className="driver-actions">
        {!point && canAssign ? (
          <button type="button" className="driver-button" onClick={onAssign} disabled={busy}>
            {t("continue")}
          </button>
        ) : null}
        {point && canStart ? (
          <button type="button" className="driver-button" onClick={onStart} disabled={busy}>
            {t("startUnloading")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function UnloadingProgressScreen({
  t,
  busy,
  transaction,
  onComplete,
}: CommonProps & {
  transaction: PublicTransaction;
  onComplete: () => void;
}) {
  const point = transaction.unloading?.point;
  return (
    <section className="driver-panel" aria-labelledby="driver-unload-progress-title">
      <h1 id="driver-unload-progress-title">{t("unloadingInProgress")}</h1>
      <p className="driver-instruction">{t("unloadingStarted")}</p>
      {point ? (
        <p className="driver-plate">
          {point.name} / {point.code}
        </p>
      ) : null}
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onComplete} disabled={busy}>
          {t("completeUnloading")}
        </button>
      </div>
    </section>
  );
}

export function CompletedScreen({
  t,
  transaction,
  onDone,
}: {
  t: Translate;
  transaction: PublicTransaction;
  onDone: () => void;
}) {
  return (
    <section className="driver-panel" aria-labelledby="driver-done-title">
      <h1 id="driver-done-title">{t("transactionCompleted")}</h1>
      <p className="driver-instruction">{t("cannotEditFinalized")}</p>
      <dl className="driver-facts">
        <div>
          <dt>{t("vehicleNumber")}</dt>
          <dd>{transaction.vehicle?.displayRegistrationNumber ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("materialLabel")}</dt>
          <dd>{transaction.material?.name ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("netWeight")}</dt>
          <dd className="driver-plate">{formatKg(transaction.netWeightKg)}</dd>
        </div>
        <div>
          <dt>{t("transactionId")}</dt>
          <dd>{transaction.referenceNumber}</dd>
        </div>
      </dl>
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onDone}>
          {t("done")}
        </button>
      </div>
    </section>
  );
}

export function ExceptionScreen({
  t,
  transaction,
  onRetry,
  onAcknowledge,
}: {
  t: Translate;
  transaction: PublicTransaction;
  onRetry: () => void;
  onAcknowledge: () => void;
}) {
  const copy = exceptionCopy(transaction);
  return (
    <section className="driver-panel driver-panel-alert" aria-labelledby="driver-exception-title">
      <h1 id="driver-exception-title">{t(copy.titleKey)}</h1>
      <p className="driver-instruction">{t(copy.bodyKey)}</p>
      <p>
        {t("requiredAction")}: {t(copy.contactKey)}
      </p>
      <div className="driver-actions">
        <button type="button" className="driver-button driver-button-secondary" onClick={onAcknowledge}>
          {t("acknowledge")}
        </button>
        <button type="button" className="driver-button" onClick={onRetry}>
          {t("retry")}
        </button>
      </div>
    </section>
  );
}

export function DuplicateDialog({
  t,
  onContinue,
  onCancel,
}: {
  t: Translate;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="driver-dup-title">
      <h2 id="driver-dup-title">{t("activeTransactionExists")}</h2>
      <p>{t("cannotStartDuplicate")}</p>
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onContinue}>
          {t("continueExisting")}
        </button>
        <button type="button" className="driver-button driver-button-secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

export function SwitchDialog({
  t,
  onConfirm,
  onCancel,
}: {
  t: Translate;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="driver-dialog" role="dialog" aria-modal="true" aria-labelledby="driver-switch-title">
      <h2 id="driver-switch-title">{t("switchTransactionConfirm")}</h2>
      <div className="driver-actions">
        <button type="button" className="driver-button" onClick={onConfirm}>
          {t("confirmSwitch")}
        </button>
        <button type="button" className="driver-button driver-button-secondary" onClick={onCancel}>
          {t("cancelSwitch")}
        </button>
      </div>
    </div>
  );
}
