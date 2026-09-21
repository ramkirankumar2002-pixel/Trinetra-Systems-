import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { createOnboardingSession, listOnboardingSessions, type OnboardingDashboardRow } from "./api.ts";

export function OnboardingDashboardPage() {
  const [items, setItems] = useState<OnboardingDashboardRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const result = await listOnboardingSessions();
    setItems(result.items);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load onboarding");
    });
  }, []);

  async function startSession(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = await createOnboardingSession();
      window.location.assign(`/onboarding/${result.session.id}`);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to start onboarding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Installation</p>
          <h1>Customer onboarding</h1>
        </div>
        <button type="button" disabled={busy} onClick={() => void startSession()}>
          Start or resume
        </button>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length === 0 ? <p>No onboarding sessions for this organization.</p> : null}
      <section className="card-grid">
        {items.map((item) => (
          <Link key={item.id} to={`/onboarding/${item.id}`} className="identity-card module-card">
            <span>{item.customer}</span>
            <strong>{item.site ?? "Site not bound"}</strong>
            <p>
              {item.currentStep} · {item.progress}% · {item.assignedImplementationUser}
            </p>
            <StatusPill value={item.status} />
            <p>
              <span>Blocking errors</span>
              {item.blockingErrors}
            </p>
            <p>
              <span>Warnings</span>
              {item.warnings}
            </p>
            <p>
              <span>Last updated</span>
              {formatDateTime(item.lastUpdated)}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
