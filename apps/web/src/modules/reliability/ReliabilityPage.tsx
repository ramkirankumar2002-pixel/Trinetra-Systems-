import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  dependencyLabel,
  downloadReliabilityExport,
  getConsistencyReport,
  getReliabilityStatus,
  runReliabilityScan,
  triggerReliabilityBackup,
  type ConsistencyFinding,
  type ReliabilityStatus,
} from "./api.ts";

export function ReliabilityPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ReliabilityStatus | null>(null);
  const [findings, setFindings] = useState<ConsistencyFinding[]>([]);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = hasPermission(user, "reliability.manage");

  async function refresh(): Promise<void> {
    const [next, report] = await Promise.all([getReliabilityStatus(), getConsistencyReport()]);
    setStatus(next.status);
    setFindings(report.findings);
    setScanned(report.scanned);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load recovery status");
    });
  }, []);

  return (
    <main className="page-shell dashboard-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Reliability</p>
          <h1>Backup and recovery</h1>
        </div>
        <div className="header-actions">
          {canManage ? (
            <>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  void runReliabilityScan()
                    .then(async () => {
                      setMessage("Recovery scan completed. Incomplete transactions were not changed.");
                      await refresh();
                    })
                    .catch((caught: unknown) => {
                      setError(isApiError(caught) ? caught.message : "Scan failed");
                    });
                }}
              >
                Run scan
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  void triggerReliabilityBackup()
                    .then(async () => {
                      setMessage("Backup request finished. Check backup status below.");
                      await refresh();
                    })
                    .catch((caught: unknown) => {
                      setError(isApiError(caught) ? caught.message : "Backup is unavailable");
                    });
                }}
              >
                Run backup
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      {status ? <ReliabilitySummary status={status} /> : <p className="session-status">Loading recovery status…</p>}

      <section className="dashboard-panel">
        <h2>Administrative export</h2>
        <p className="empty-state">
          Filtered CSV extracts only. This is not a database dump and cannot restore production.
        </p>
        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={() => void downloadReliabilityExport("transactions")}>
            Transactions
          </button>
          <button type="button" className="ghost-button" onClick={() => void downloadReliabilityExport("weighments")}>
            Weighments
          </button>
          {hasPermission(user, "audit.read", "reliability.read") ? (
            <button type="button" className="ghost-button" onClick={() => void downloadReliabilityExport("audit")}>
              Audit log
            </button>
          ) : null}
          {hasPermission(user, "security.read", "reliability.read") ? (
            <button type="button" className="ghost-button" onClick={() => void downloadReliabilityExport("security")}>
              Security events
            </button>
          ) : null}
        </div>
      </section>

      <section className="dashboard-panel">
        <h2>Consistency warnings</h2>
        <p className="empty-state">Report only. Records are not modified and missing audit rows are not fabricated.</p>
        {findings.length === 0 ? (
          <p className="empty-state">{scanned === 0 ? "No transactions were scanned." : `No warnings in ${scanned} scanned transactions.`}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Code</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((finding) => (
                  <tr key={`${finding.entityId}-${finding.code}-${finding.message}`}>
                    <td>
                      <StatusPill value={finding.severity} />
                    </td>
                    <td>{finding.code.replaceAll("_", " ")}</td>
                    <td>{finding.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export function ReliabilitySummary({ status }: { status: ReliabilityStatus }) {
  const postgres = status.dependencies.find((item) => item.name === "postgresql");
  const backend = status.dependencies.find((item) => item.name === "backend");
  const gateway = status.dependencies.find((item) => item.name === "edgeGateway");
  const sync = status.dependencies.find((item) => item.name === "offlineSync");

  return (
    <>
      <section className="kpi-grid" aria-label="Recovery status">
        <article className="identity-card">
          <p>
            <span>System status</span>
            {status.systemStatus}
          </p>
          <StatusPill value={status.systemStatus} />
        </article>
        <article className="identity-card">
          <p>
            <span>Database</span>
            {postgres?.status ?? "UNKNOWN"}
          </p>
          <p>
            <span>Name</span>
            {status.databaseName ?? "Not configured"}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Backend</span>
            {backend?.status ?? "UNKNOWN"}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Gateway</span>
            {gateway?.status ?? "DISABLED"}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Synchronization</span>
            {sync?.status ?? "DISABLED"}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Last backup</span>
            {status.backup.lastSuccessfulAt ? formatDateTime(status.backup.lastSuccessfulAt) : "None"}
          </p>
          <p>
            <span>Backup status</span>
            {status.backup.status.replaceAll("_", " ")}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Open recovery warnings</span>
            {status.openRecoveryWarnings}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Stale transactions</span>
            {status.staleTransactionCount}
          </p>
        </article>
        <article className="identity-card">
          <p>
            <span>Offline gateways</span>
            {status.offlineGateways.length}
          </p>
        </article>
      </section>

      <section className="dashboard-panel">
        <h2>Dependencies</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Status</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {status.dependencies.map((item) => (
                <tr key={item.name}>
                  <td>{dependencyLabel(item.name)}</td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  <td>{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="empty-state">{status.backup.infrastructureNote}</p>
      </section>

      <section className="dashboard-panel">
        <h2>Stale transactions</h2>
        {status.staleTransactions.length === 0 ? (
          <p className="empty-state">No intermediate transactions exceeded the attention threshold.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Warning</th>
                </tr>
              </thead>
              <tbody>
                {status.staleTransactions.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/transactions/${item.id}`} className="text-link">
                        {item.referenceNumber}
                      </Link>
                    </td>
                    <td>
                      <StatusPill value={item.status} />
                    </td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                    <td>{item.warning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dashboard-panel">
        <h2>Offline gateways</h2>
        {status.offlineGateways.length === 0 ? (
          <p className="empty-state">No stale or offline gateways in the current scope.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gateway</th>
                  <th>Liveness</th>
                  <th>Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {status.offlineGateways.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to="/weighbridge/gateways" className="text-link">
                        {item.code}
                      </Link>
                    </td>
                    <td>
                      <StatusPill value={item.liveness} />
                    </td>
                    <td>{item.lastHeartbeatAt ? formatDateTime(item.lastHeartbeatAt) : "Never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
