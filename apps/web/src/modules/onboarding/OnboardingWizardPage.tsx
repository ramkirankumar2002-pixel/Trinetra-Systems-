import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  applyOnboardingStep,
  cancelOnboarding,
  completeOnboarding,
  findingTone,
  getOnboardingSession,
  runHardwareChecks,
  runPilotTest,
  runReadiness,
  validateOnboarding,
  type OnboardingCatalog,
  type PublicOnboardingSession,
} from "./api.ts";

export function OnboardingWizardPage() {
  const { id } = useParams();
  const [session, setSession] = useState<PublicOnboardingSession | null>(null);
  const [catalog, setCatalog] = useState<OnboardingCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [viewingStep, setViewingStep] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    if (!id) {
      return;
    }
    const result = await getOnboardingSession(id);
    setSession(result.session);
    setCatalog(result.catalog);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load onboarding");
    });
  }, [id]);

  useEffect(() => {
    if (!session || !catalog) {
      return;
    }
    const active = viewingStep ?? session.currentStep;
    if (active === "ORGANIZATION" && catalog.organization) {
      setForm({
        name: catalog.organization.name,
        code: catalog.organization.slug,
        contactName: catalog.organization.contactName ?? "",
        contactEmail: catalog.organization.contactEmail ?? "",
        defaultLanguage: catalog.organization.defaultLanguage,
        voiceEnabled: catalog.organization.driverVoiceEnabled ? "true" : "false",
        audioEnabled: catalog.organization.driverAudioEnabled ? "true" : "false",
      });
      setSelected(catalog.organization.enabledDriverLanguages);
    } else {
      setForm({});
      setSelected([]);
    }
  }, [viewingStep, session?.currentStep, catalog?.organization?.id]);

  const step = viewingStep ?? session?.currentStep ?? "ORGANIZATION";

  const payload = useMemo(() => buildPayload(step, form, selected, catalog), [step, form, selected, catalog]);

  async function run(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Onboarding action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!id) {
    return <main className="page-shell">Missing onboarding session.</main>;
  }

  if (!session || !catalog) {
    return (
      <main className="page-shell">
        <h1>Onboarding</h1>
        {error ? <p className="form-error">{error}</p> : <p>Loading onboarding…</p>}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Installation wizard</p>
          <h1>{session.organization.name}</h1>
          <p>
            {session.site?.name ?? "Site not bound"} · {session.completionPercent}% · {session.createdBy.fullName}
          </p>
        </div>
        <Link to="/onboarding">Overview</Link>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="login-note">{notice}</p> : null}

      <ol className="wizard-steps">
        {session.steps.map((item) => (
          <li key={item.key} className={`wizard-step wizard-step-${item.state.toLowerCase()}`}>
            <button
              type="button"
              disabled={busy || item.state === "BLOCKED" || item.state === "PENDING"}
              onClick={() => setViewingStep(item.key)}
            >
              {item.index}. {item.label}
            </button>
            <StatusPill value={item.state} />
          </li>
        ))}
      </ol>

      <section className="identity-card">
        <h2>{session.steps.find((item) => item.key === step)?.label ?? session.currentStepLabel}</h2>
        <StepForm
          step={step}
          form={form}
          selected={selected}
          catalog={catalog}
          session={session}
          onForm={setForm}
          onSelected={setSelected}
        />
        <div className="button-row">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await applyOnboardingStep(id, step, true, payload);
                setViewingStep(result.session.currentStep);
                if (result.temporaryPassword) {
                  setNotice(`Temporary password issued once: ${result.temporaryPassword}`);
                } else if (result.issuedCredential) {
                  setNotice(`Gateway credential issued once: ${result.issuedCredential}`);
                } else {
                  setNotice(`${result.session.currentStepLabel} is next.`);
                }
              })
            }
          >
            Save and continue
          </button>
          {step === "DEVICES" ? (
            <button
              type="button"
              className="ghost-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await runHardwareChecks(id);
                  setNotice("Hardware checks recorded. No production transaction was created.");
                })
              }
            >
              Run hardware tests
            </button>
          ) : null}
          {step === "VALIDATION" ? (
            <button
              type="button"
              className="ghost-button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await validateOnboarding(id);
                })
              }
            >
              Run validation
            </button>
          ) : null}
          {step === "PILOT_READINESS" ? (
            <>
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await runReadiness(id);
                  })
                }
              >
                Run readiness
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await runPilotTest(id);
                    setNotice(`Pilot transaction ${result.transaction.referenceNumber} started in PILOT mode.`);
                  })
                }
              >
                Start pilot test
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await completeOnboarding(id);
                    setNotice("Onboarding completed.");
                  })
                }
              >
                Complete onboarding
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await cancelOnboarding(id);
              })
            }
          >
            Cancel (keep data)
          </button>
        </div>
      </section>

      {session.lastValidation ? (
        <section>
          <h2>Validation</h2>
          {session.lastValidation.findings.map((finding) => (
            <p key={finding.key} className={`finding finding-${findingTone(finding.severity)}`}>
              <StatusPill value={finding.severity} /> {finding.message}
            </p>
          ))}
        </section>
      ) : null}

      {session.lastReadiness ? (
        <section>
          <h2>Pilot readiness</h2>
          {session.lastReadiness.items.map((item) => (
            <p key={item.key} className={`finding finding-${findingTone(item.status)}`}>
              <StatusPill value={item.status} /> {item.label}: {item.message}
            </p>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function StepForm({
  step,
  form,
  selected,
  catalog,
  session,
  onForm,
  onSelected,
}: {
  step: string;
  form: Record<string, string>;
  selected: string[];
  catalog: OnboardingCatalog;
  session: PublicOnboardingSession;
  onForm: (value: Record<string, string>) => void;
  onSelected: (value: string[]) => void;
}) {
  function field(name: string, label: string, type = "text") {
    return (
      <label>
        {label}
        <input
          type={type}
          value={form[name] ?? ""}
          onChange={(event) => onForm({ ...form, [name]: event.target.value })}
        />
      </label>
    );
  }

  switch (step) {
    case "ORGANIZATION":
      return (
        <div className="form-grid">
          {field("name", "Organization name")}
          {field("code", "Organization code")}
          {field("contactName", "Contact name")}
          {field("contactEmail", "Contact email", "email")}
          <label>
            Default driver language
            <select value={form.defaultLanguage ?? "en"} onChange={(event) => onForm({ ...form, defaultLanguage: event.target.value })}>
              {catalog.languages.map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Enabled driver languages</legend>
            {catalog.languages.map((language) => (
              <label key={language}>
                <input
                  type="checkbox"
                  checked={selected.includes(language)}
                  onChange={() => onSelected(toggle(selected, language))}
                />
                {language}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={form.voiceEnabled !== "false"}
              onChange={(event) => onForm({ ...form, voiceEnabled: event.target.checked ? "true" : "false" })}
            />
            Voice enabled
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.audioEnabled !== "false"}
              onChange={(event) => onForm({ ...form, audioEnabled: event.target.checked ? "true" : "false" })}
            />
            Audio feedback
          </label>
        </div>
      );
    case "SITE":
      return (
        <div className="form-grid">
          {field("name", "Site name")}
          {field("code", "Site code")}
          {field("location", "Location")}
          {field("timezone", "Timezone")}
        </div>
      );
    case "DEPARTMENTS":
      return (
        <fieldset>
          <legend>Departments for this customer</legend>
          {catalog.departments.map((department) => (
            <label key={department.id}>
              <input
                type="checkbox"
                checked={selected.includes(department.id)}
                onChange={() => onSelected(toggle(selected, department.id))}
              />
              {department.name}
            </label>
          ))}
        </fieldset>
      );
    case "USERS":
      return (
        <div className="form-grid">
          {field("fullName", "Name")}
          {field("email", "Login identity", "email")}
          <label>
            Role
            <select value={form.roleId ?? ""} onChange={(event) => onForm({ ...form, roleId: event.target.value })}>
              <option value="">Select role</option>
              {catalog.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <p>Existing users: {catalog.users.map((user) => user.email).join(", ") || "none"}</p>
        </div>
      );
    case "WEIGHBRIDGE":
      return (
        <div className="form-grid">
          {field("name", "Weighbridge name")}
          {field("code", "Code")}
          {field("capacityKg", "Capacity (kg)")}
          {field("unit", "Unit")}
          <p>Hardware mode is limited to SIMULATOR until protocol documentation is provided.</p>
        </div>
      );
    case "GATEWAY":
      return (
        <div className="form-grid">
          {field("name", "Gateway name")}
          {field("code", "Gateway identity")}
          <p>If the gateway is offline, this step stays incomplete: GATEWAY NOT CONNECTED.</p>
        </div>
      );
    case "DEVICES":
      return (
        <div className="form-grid">
          <label>
            Device type
            <select value={form.deviceType ?? "WEIGHBRIDGE_INDICATOR"} onChange={(event) => onForm({ ...form, deviceType: event.target.value })}>
              <option value="WEIGHBRIDGE_INDICATOR">Weight indicator</option>
              <option value="CAMERA">ANPR camera</option>
              <option value="SCANNER">Scanner</option>
            </select>
          </label>
          {field("name", "Name")}
          {field("code", "Code")}
          {field("manufacturer", "Manufacturer")}
          {field("model", "Model")}
          <label>
            Gateway
            <select value={form.gatewayId ?? catalog.gateways[0]?.id ?? ""} onChange={(event) => onForm({ ...form, gatewayId: event.target.value })}>
              {catalog.gateways.map((gateway) => (
                <option key={gateway.id} value={gateway.id}>
                  {gateway.code}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    case "MATERIALS":
      return (
        <div className="form-grid">
          {field("name", "Material name")}
          {field("code", "Code")}
          <label>
            Workflow
            <select value={form.workflowDefinitionId ?? ""} onChange={(event) => onForm({ ...form, workflowDefinitionId: event.target.value })}>
              <option value="">None</option>
              {catalog.workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name} ({workflow.status})
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    case "WORKFLOWS":
      return (
        <div className="form-grid">
          <label>
            Publish workflow
            <select value={form.workflowId ?? catalog.workflows[0]?.id ?? ""} onChange={(event) => onForm({ ...form, workflowId: event.target.value })}>
              {catalog.workflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.name} · {workflow.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      );
    case "DOCUMENTS":
      return (
        <fieldset>
          <legend>Required document types</legend>
          {catalog.documentTypes.map((type) => (
            <label key={type.code}>
              <input type="checkbox" checked={selected.includes(type.code)} onChange={() => onSelected(toggle(selected, type.code))} />
              {type.label}
            </label>
          ))}
        </fieldset>
      );
    case "UNLOADING":
      return (
        <div className="form-grid">
          {field("name", "Unloading point name")}
          {field("code", "Code")}
        </div>
      );
    case "NOTIFICATIONS":
      return (
        <div className="form-grid">
          <label>
            Recipient
            <select value={form.userId ?? ""} onChange={(event) => onForm({ ...form, userId: event.target.value })}>
              <option value="">Select user</option>
              {catalog.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.fullName} ({user.email})
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>In-app categories</legend>
            {catalog.notificationCategories.map((category) => (
              <label key={category}>
                <input type="checkbox" checked={selected.includes(category)} onChange={() => onSelected(toggle(selected, category))} />
                {category}
              </label>
            ))}
          </fieldset>
        </div>
      );
    case "VALIDATION":
      return <p>Run validation, then accept warnings if appropriate. ERROR items must be resolved.</p>;
    case "PILOT_READINESS":
      return (
        <p>
          Hardware readiness is claimed only after tests. Current session status: {session.status}.
        </p>
      );
    default:
      return <p>Continue with the current configuration.</p>;
  }
}

function buildPayload(
  step: string,
  form: Record<string, string>,
  selected: string[],
  catalog: OnboardingCatalog | null,
): Record<string, unknown> {
  switch (step) {
    case "ORGANIZATION":
      return {
        name: form.name,
        code: form.code,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        defaultLanguage: form.defaultLanguage ?? "en",
        languages: selected.length > 0 ? selected : catalog?.languages ?? ["en"],
        voiceEnabled: form.voiceEnabled !== "false",
        audioEnabled: form.audioEnabled !== "false",
      };
    case "SITE":
      return { name: form.name, code: form.code, location: form.location, timezone: form.timezone || "Asia/Kolkata" };
    case "DEPARTMENTS":
      return { selectedDepartmentIds: selected };
    case "USERS":
      return form.email ? { fullName: form.fullName, email: form.email, roleId: form.roleId } : {};
    case "WEIGHBRIDGE":
      return form.code
        ? { name: form.name, code: form.code, capacityKg: form.capacityKg, unit: form.unit || "KG", hardwareMode: "SIMULATOR" }
        : {};
    case "GATEWAY":
      return form.code ? { name: form.name, code: form.code } : {};
    case "DEVICES":
      return form.code
        ? {
            deviceType: form.deviceType || "WEIGHBRIDGE_INDICATOR",
            name: form.name,
            code: form.code,
            manufacturer: form.manufacturer,
            model: form.model,
            gatewayId: form.gatewayId || catalog?.gateways[0]?.id,
            provider: "SIMULATOR",
          }
        : {};
    case "MATERIALS":
      return form.code
        ? { name: form.name, code: form.code, isActive: true, workflowDefinitionId: form.workflowDefinitionId }
        : {};
    case "WORKFLOWS":
      return form.workflowId || catalog?.workflows[0]?.id
        ? { workflowId: form.workflowId || catalog?.workflows[0]?.id, publish: true }
        : {};
    case "DOCUMENTS":
      return selected.length > 0 ? { documentTypeCodes: selected } : {};
    case "UNLOADING":
      return form.code ? { name: form.name, code: form.code } : {};
    case "NOTIFICATIONS":
      return form.userId ? { userId: form.userId, categories: selected } : {};
    case "VALIDATION":
      return { acceptedWarningKeys: selected };
    default:
      return {};
  }
}

function toggle(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
