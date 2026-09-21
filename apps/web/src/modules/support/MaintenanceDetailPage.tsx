import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  cancelMaintenanceRecord,
  completeMaintenanceRecord,
  getMaintenance,
  startMaintenanceRecord,
  type PublicMaintenance,
} from "./api.ts";

export function MaintenanceDetailPage() {
  const { id = "" } = useParams();
  const [record, setRecord] = useState<PublicMaintenance | null>(null);
  const [findings, setFindings] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(): Promise<void> {
    const result = await getMaintenance(id);
    setRecord(result.maintenance);
    setFindings(result.maintenance.findings ?? "");
    setActionTaken(result.maintenance.actionTaken ?? "");
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load maintenance"));
  }, [id]);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  if (!record) {
    return (
      <main className="page-shell">
        {error ? <p className="form-error">{error}</p> : <p className="login-note">Loading maintenance…</p>}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{record.recordNumber}</p>
          <h1>{record.reason}</h1>
        </div>
        <div className="button-row">
          <StatusPill value={record.status} />
          <StatusPill value={record.type} />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="identity-card">
        <p>{record.description}</p>
        <p>
          <span>Site</span>
          {record.site.name}
        </p>
        <p>
          <span>Technician</span>
          {record.performedBy?.fullName ?? "—"}
        </p>
        {record.weighbridge ? (
          <p>
            <span>Weighbridge</span>
            <Link to={`/support/weighbridges/${record.weighbridge.id}`}>{record.weighbridge.name}</Link>
          </p>
        ) : null}
        {record.device ? (
          <p>
            <span>Device</span>
            <Link to={`/support/devices/${record.device.id}`}>{record.device.name}</Link>
          </p>
        ) : null}
        {record.ticket ? (
          <p>
            <span>Ticket</span>
            <Link to={`/support/tickets/${record.ticket.id}`}>{record.ticket.ticketNumber}</Link>
          </p>
        ) : null}
        {record.maintenanceWindow ? (
          <p>
            <span>Maintenance window</span>
            {record.maintenanceWindow.status} · started {formatDateTime(record.maintenanceWindow.startedAt)}
            {record.maintenanceWindow.endedAt ? ` · ended ${formatDateTime(record.maintenanceWindow.endedAt)}` : ""}
          </p>
        ) : null}
        {record.findings ? (
          <p>
            <span>Findings</span>
            {record.findings}
          </p>
        ) : null}
        {record.actionTaken ? (
          <p>
            <span>Action taken</span>
            {record.actionTaken}
          </p>
        ) : null}
      </section>

      {record.status === "SCHEDULED" || record.status === "IN_PROGRESS" ? (
        <section className="panel-form">
          <h2>Complete work</h2>
          <label>
            Findings
            <textarea value={findings} onChange={(event) => setFindings(event.target.value)} rows={3} />
          </label>
          <label>
            Action taken
            <textarea value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} rows={3} />
          </label>
          <div className="button-row">
            {record.status === "SCHEDULED" ? (
              <button type="button" disabled={busy} onClick={() => void run(() => startMaintenanceRecord(id))}>
                Start
              </button>
            ) : null}
            {record.status === "IN_PROGRESS" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => completeMaintenanceRecord(id, { findings, actionTaken }))}
              >
                Complete
              </button>
            ) : null}
            <button type="button" className="ghost-button" disabled={busy} onClick={() => void run(() => cancelMaintenanceRecord(id))}>
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
