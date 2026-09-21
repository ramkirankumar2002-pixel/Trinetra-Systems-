import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  disableCamera,
  enableCamera,
  listCameras,
  testCamera,
  updateCamera,
  type PublicCamera,
} from "./api.ts";

export function CameraManagementPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicCamera[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(user, "camera.manage", "weighbridge.manage");

  async function refresh(): Promise<void> {
    const result = await listCameras();
    setItems(result.items);
    setSelectedId((current) => current ?? result.items[0]?.id ?? null);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load cameras");
    });
  }, []);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Camera action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Cameras</p>
          <h1>Entry cameras</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      <section className="card-grid">
        {items.map((camera) => (
          <article key={camera.id} className="identity-card">
            <p>
              <span>Camera</span>
              {camera.name}
            </p>
            <p>
              <span>Weighbridge</span>
              {camera.weighbridgeCode}
            </p>
            <p>
              <span>Purpose</span>
              {camera.purpose}
            </p>
            <p>
              <span>Provider</span>
              {camera.cameraProviderType}
            </p>
            <StatusPill value={camera.status} />
            <StatusPill value={`ANPR ${camera.anprStatus}`} />
            <StatusPill value={camera.healthy ? "HEALTHY" : "UNHEALTHY"} />
            {camera.simulated ? <StatusPill value="SIMULATED" /> : null}
            <p>
              <span>Last frame</span>
              {camera.lastFrameAt ? formatDateTime(camera.lastFrameAt) : "—"}
            </p>
            <p>
              <span>Last communication</span>
              {camera.lastCommunicationAt ? formatDateTime(camera.lastCommunicationAt) : "—"}
            </p>
            <p>
              <span>Enabled</span>
              {camera.enabled ? "Yes" : "No"}
            </p>
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setSelectedId(camera.id)}>
                View
              </button>
              {canManage ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => enableCamera(camera.id), "Camera enabled")}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void run(() => disableCamera(camera.id), "Camera disabled")}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void run(() => testCamera(camera.id), "Connection test finished")}
                  >
                    Test connection
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {selected ? (
        <section className="identity-card">
          <h2>{selected.name}</h2>
          <p>
            <span>Site</span>
            {selected.site.name}
          </p>
          <p>
            <span>Connection</span>
            {selected.connectionType}
          </p>
          <p>
            <span>Thresholds</span>
            High {Math.round(selected.highConfidenceMin * 100)}% · Medium {Math.round(selected.mediumConfidenceMin * 100)}%
          </p>
          <p>
            <span>Last error</span>
            {selected.lastError ?? "None"}
          </p>
          {canManage && selected.simulated ? (
            <label htmlFor="scenario">
              Demo scenario
              <select
                id="scenario"
                value={selected.simulatorScenario}
                disabled={busy}
                onChange={(event) =>
                  void run(() => updateCamera(selected.id, { simulatorScenario: event.target.value }), "Scenario updated")
                }
              >
                <option value="HIGH_KNOWN">High confidence known</option>
                <option value="MEDIUM_KNOWN">Medium confidence known</option>
                <option value="LOW">Low confidence</option>
                <option value="UNKNOWN">Unknown vehicle</option>
                <option value="NO_PLATE">No plate</option>
                <option value="MULTI_CANDIDATE">Multiple candidates</option>
              </select>
            </label>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
