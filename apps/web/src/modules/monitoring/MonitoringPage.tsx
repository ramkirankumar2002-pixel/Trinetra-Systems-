import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatApiError } from "../../shared/api/errors.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  getMonitorDevices,
  getMonitorGateways,
  getMonitoringStatus,
  monitoringPollMs,
  serviceLabel,
  type MonitoringStatus,
  type PublicMonitorDevice,
  type PublicMonitorGateway,
} from "./api.ts";

const POLL_MS = monitoringPollMs(import.meta.env.VITE_MONITORING_POLL_MS);

export function MonitoringPage() {
  const [status, setStatus] = useState<MonitoringStatus | null>(null);
  const [gateways, setGateways] = useState<PublicMonitorGateway[]>([]);
  const [devices, setDevices] = useState<PublicMonitorDevice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getMonitoringStatus(), getMonitorGateways(), getMonitorDevices()])
      .then(([next, gatewayResult, deviceResult]) => {
        if (cancelled) {
          return;
        }
        setStatus(next.status);
        setGateways(gatewayResult.items);
        setDevices(deviceResult.items);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(formatApiError(caught, "Unable to load monitoring status"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshToken((current) => current + 1);
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main className="page-shell dashboard-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Observability</p>
          <h1>System monitoring</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {status ? (
        <>
          <p className="empty-state">{status.metricsLimitation}</p>
          {status.development ? (
            <p className="login-note">
              Development view — simulators are labelled. Simulated hardware is not real hardware.
            </p>
          ) : null}

          <section className="kpi-grid" aria-label="System status">
            <article className="kpi-card">
              <span>System</span>
              <strong>
                <StatusPill value={status.systemStatus} />
              </strong>
            </article>
            {status.services.map((service) => (
              <article key={service.name} className="kpi-card">
                <span>{serviceLabel(service.name)}</span>
                <strong>
                  <StatusPill value={service.status} />
                </strong>
                <p>
                  {service.simulated ? "SIMULATION — " : ""}
                  {service.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="kpi-grid" aria-label="Operational metrics">
            <MetricCard label="Transactions" value={status.operational.transactionsInProgress} hint={`${status.operational.transactionsCompleted} completed`} />
            <MetricCard label="Approvals" value={status.operational.pendingApprovals} hint={`${status.operational.approved} approved / ${status.operational.rejected} rejected`} />
            <MetricCard label="Unloading" value={status.operational.activeUnloading} hint={`${status.operational.pendingUnloading} pending`} />
            <MetricCard label="Exceptions" value={status.operational.transactionsWithExceptions} />
            <MetricCard label="Security events" value={status.operational.openSecurityEvents} hint={`${status.operational.weightAnomalies} weight anomalies`} />
          </section>

          <section className="dashboard-panel">
            <h2>Current issues</h2>
            {status.incidents.length === 0 && status.currentIssues.openAlerts === 0 ? (
              <p className="empty-state">No open operational incidents.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Service</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.incidents.map((incident) => (
                      <tr key={incident.id}>
                        <td>{incident.title}</td>
                        <td>
                          <StatusPill value={incident.severity} />
                        </td>
                        <td>
                          <StatusPill value={incident.status} />
                        </td>
                        <td>{incident.service}</td>
                        <td>{formatDateTime(incident.occurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="empty-state">
              Offline gateways: {status.currentIssues.offlineGateways}. Failed sync events:{" "}
              {status.currentIssues.failedSynchronization}. Stale transactions: {status.currentIssues.staleTransactions}.
            </p>
          </section>

          <section className="dashboard-panel">
            <h2>Gateways</h2>
            {gateways.length === 0 ? (
              <p className="empty-state">No gateways registered.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Gateway</th>
                      <th>Site</th>
                      <th>Status</th>
                      <th>Heartbeat</th>
                      <th>Devices</th>
                      <th>Pending / failed</th>
                      <th>Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gateways.map((gateway) => (
                      <tr key={gateway.id}>
                        <td>{gateway.code}</td>
                        <td>{gateway.site.name}</td>
                        <td>
                          <StatusPill value={gateway.monitorStatus} />
                        </td>
                        <td>{gateway.lastHeartbeatAt ? formatDateTime(gateway.lastHeartbeatAt) : "—"}</td>
                        <td>{gateway.connectedDevices}</td>
                        <td>
                          {gateway.pendingEvents} / {gateway.failedEvents}
                        </td>
                        <td>{gateway.softwareVersion ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-panel">
            <h2>Devices</h2>
            <p className="empty-state">Communication state is software connectivity, not physical device health.</p>
            {devices.length === 0 ? (
              <p className="empty-state">No devices registered.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Device</th>
                      <th>Type</th>
                      <th>Gateway</th>
                      <th>Communication</th>
                      <th>Last communication</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((device) => (
                      <tr key={`${device.source}-${device.id}`}>
                        <td>
                          {device.name}
                          {device.simulated ? " (simulation)" : ""}
                        </td>
                        <td>{device.deviceType.replaceAll("_", " ")}</td>
                        <td>{device.gatewayCode ?? "—"}</td>
                        <td>
                          Communication: <StatusPill value={device.communication} />
                        </td>
                        <td>{device.lastCommunicationAt ? formatDateTime(device.lastCommunicationAt) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {status.development ? (
            <section className="dashboard-panel">
              <h2>Development simulators</h2>
              <p className="empty-state">These labels are hidden in production. Simulation is not a live device.</p>
              <div className="kpi-grid">
                {Object.entries(status.development.simulators).map(([name, enabled]) => (
                  <article key={name} className="kpi-card">
                    <span>{name}</span>
                    <strong>
                      <StatusPill value={enabled ? "SIMULATION" : "DISABLED"} />
                    </strong>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <p className="empty-state">
            Dead-letter retry stays on the <Link to="/weighbridge/sync">sync</Link> page with existing authorization and
            audit. Failed events cannot be silently deleted here.
          </p>
        </>
      ) : (
        <p className="session-status">Loading monitoring status…</p>
      )}
    </main>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <article className="kpi-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <p>{hint}</p> : null}
    </article>
  );
}
