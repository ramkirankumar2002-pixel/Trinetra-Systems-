import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  devicesByType,
  getPilotOverview,
  latestCommissioningResult,
  recordCommissioningTest,
  updateSiteMode,
  type PublicPilotDevice,
  type PublicPilotOverview,
} from "./api.ts";

export function HardwarePilotPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<PublicPilotOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(user, "hardware.pilot", "weighbridge.manage");

  async function refresh(): Promise<void> {
    setOverview(await getPilotOverview());
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load hardware pilot");
    });
  }, []);

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Pilot action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!overview) {
    return (
      <main className="page-shell">
        <p className={error ? "form-error" : "session-status"}>{error ?? "Loading hardware pilot…"}</p>
      </main>
    );
  }

  const indicators = devicesByType(overview.devices, "WEIGHBRIDGE_INDICATOR");
  const cameras = devicesByType(overview.devices, "CAMERA");
  const scanners = devicesByType(overview.devices, "SCANNER");

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Hardware pilot</p>
          <h1>Real device commissioning</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      <section className="identity-card">
        <p>
          <span>Real adapters</span>
          Not finalized
        </p>
        <p>{overview.hardwareInformationRequired}</p>
        <p className="login-note">{overview.metrologyNotice}</p>
      </section>

      <section className="card-grid">
        {overview.sites.map((site) => (
          <article key={site.id} className="identity-card">
            <p>
              <span>Site mode</span>
              {site.code}
            </p>
            <StatusPill value={site.operationMode} />
            {canManage ? (
              <select
                value={site.operationMode}
                disabled={busy}
                onChange={(event) => {
                  void run(() => updateSiteMode(site.id, event.target.value), "Site mode updated");
                }}
              >
                <option value="SIMULATION">SIMULATION</option>
                <option value="PILOT">PILOT</option>
                <option value="PRODUCTION">PRODUCTION</option>
              </select>
            ) : null}
          </article>
        ))}
      </section>

      <h2>Gateway</h2>
      <section className="card-grid">
        {overview.gateways.map((gateway) => (
          <article key={gateway.id} className="identity-card">
            <p>
              <span>Gateway ID</span>
              {gateway.code}
            </p>
            <p>
              <span>Site</span>
              {gateway.site.name}
            </p>
            <StatusPill value={gateway.status} />
            <p>
              <span>Version</span>
              {gateway.softwareVersion ?? "—"}
            </p>
            <p>
              <span>Heartbeat</span>
              {gateway.lastHeartbeatAt ? formatDateTime(gateway.lastHeartbeatAt) : "Never"}
            </p>
          </article>
        ))}
      </section>

      <h2>Weighbridge indicator</h2>
      <DeviceCards devices={indicators} kind="weight" />

      <h2>ANPR camera</h2>
      <DeviceCards devices={cameras} kind="camera" />

      <h2>Scanner</h2>
      <DeviceCards devices={scanners} kind="scanner" />

      <h2>Commissioning tests</h2>
      <p>
        Weighbridge {latestCommissioningResult(overview.commissioning, "WEIGHBRIDGE")} · Camera{" "}
        {latestCommissioningResult(overview.commissioning, "CAMERA")} · Scanner{" "}
        {latestCommissioningResult(overview.commissioning, "SCANNER")} · Edge{" "}
        {latestCommissioningResult(overview.commissioning, "EDGE")}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Test</th>
              <th>Result</th>
              <th>Timestamp</th>
              <th>User</th>
              {canManage ? <th>Record</th> : null}
            </tr>
          </thead>
          <tbody>
            {overview.commissioning.map((test) => (
              <tr key={test.id}>
                <td>{test.label}</td>
                <td>
                  <StatusPill value={test.result} />
                </td>
                <td>{test.testedAt ? formatDateTime(test.testedAt) : "—"}</td>
                <td>{test.testedBy?.fullName ?? "—"}</td>
                {canManage ? (
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            recordCommissioningTest({
                              ...(test.deviceId ? { deviceId: test.deviceId } : {}),
                              testKey: test.testKey,
                              result: "PASS",
                            }),
                          "Commissioning result saved",
                        )
                      }
                    >
                      Pass
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            recordCommissioningTest({
                              ...(test.deviceId ? { deviceId: test.deviceId } : {}),
                              testKey: test.testKey,
                              result: "FAIL",
                            }),
                          "Commissioning result saved",
                        )
                      }
                    >
                      Fail
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function DeviceCards({ devices, kind }: { devices: PublicPilotDevice[]; kind: "weight" | "camera" | "scanner" }) {
  if (devices.length === 0) {
    return <p className="session-status">No devices registered.</p>;
  }
  return (
    <section className="card-grid">
      {devices.map((device) => (
        <article key={device.id} className="identity-card">
          <p>
            <span>Device</span>
            {device.deviceId}
          </p>
          <p>
            <span>Manufacturer</span>
            {device.manufacturer ?? "Not provided"}
          </p>
          <p>
            <span>Model</span>
            {device.model ?? "Not provided"}
          </p>
          <p>
            <span>Protocol</span>
            {device.protocol ?? "PROTOCOL DETAILS REQUIRED"}
          </p>
          <p>
            <span>Connection</span>
            {device.connectionType ?? "—"}
            {device.serialPort ? ` · ${device.serialPort}` : ""}
            {device.host ? ` · ${device.host}:${device.port ?? ""}` : ""}
          </p>
          <StatusPill value={device.status} />
          <p>
            <span>Pilot status</span>
            {device.installationStatus} · {device.protocolReadiness}
          </p>
          <p>
            <span>Last communication</span>
            {device.lastCommunicationAt ? formatDateTime(device.lastCommunicationAt) : "Never"}
          </p>
          {kind === "weight" ? (
            <>
              <p>
                <span>Last weight</span>
                {device.lastWeightKg ?? "—"}
              </p>
              <p>
                <span>Stability</span>
                {device.lastStability === null ? "—" : String(device.lastStability)}
              </p>
              {device.diagnostic ? (
                <p>
                  <span>Diagnostic</span>
                  RAW: {device.diagnostic.raw ?? "—"} · PARSED: {device.diagnostic.parsedWeightKg ?? "—"} ·{" "}
                  {device.diagnostic.testKind}
                </p>
              ) : null}
            </>
          ) : null}
          {kind === "camera" ? (
            <>
              <p>
                <span>Last plate</span>
                {device.lastPlate ?? "—"}
              </p>
              <p>
                <span>Confidence</span>
                {device.lastConfidence ?? "—"}
              </p>
              <p>
                <span>Last frame</span>
                {device.lastFrameAvailable ? "Available (restricted)" : "None"}
              </p>
            </>
          ) : null}
          {kind === "scanner" ? (
            <p>
              <span>Last scan</span>
              {device.lastScan ?? "—"}
            </p>
          ) : null}
          {device.lastError ? (
            <p>
              <span>Last error</span>
              {device.lastError}
            </p>
          ) : null}
        </article>
      ))}
    </section>
  );
}
