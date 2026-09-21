import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { getDeviceHistory, getWeighbridgeHistory } from "./api.ts";

type HistoryPayload = {
  device?: {
    id: string;
    code: string;
    name: string;
    status: string;
    installationStatus: string;
    site: { name: string };
    gateway?: { name: string } | null;
    weighbridge?: { id: string; name: string } | null;
  };
  weighbridge?: { id: string; code: string; name: string; site: { name: string }; hardwareStatus: string | null };
  tickets?: Array<{ id: string; ticketNumber: string; subject: string; status: string; createdAt: string }>;
  maintenance?: Array<{ id: string; recordNumber: string; type: string; status: string; reason: string }>;
  commissioningTests?: Array<{ id: string; testKey: string; result: string }>;
  recentAlerts?: Array<{ id: string; title: string; status: string; createdAt: string }>;
  recentAnomalies?: Array<{ id: string; title: string; status: string }>;
  maintenanceWindows?: Array<{ id: string; status: string; reason: string; startedAt: string; endedAt: string | null }>;
};

export function DeviceHistoryPage({ kind }: { kind: "device" | "weighbridge" }) {
  const { id = "" } = useParams();
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = kind === "device" ? getDeviceHistory : getWeighbridgeHistory;
    void load(id)
      .then((payload) => setData(payload as HistoryPayload))
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load service history"));
  }, [id, kind]);

  const title = data?.device?.name ?? data?.weighbridge?.name ?? "Service history";

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Service history</p>
          <h1>{title}</h1>
        </div>
        <div className="button-row">
          <Link
            className="text-link"
            to={`/support/tickets/new?${kind === "device" ? `deviceId=${id}` : `weighbridgeId=${id}`}${data?.device?.weighbridge ? `&weighbridgeId=${data.device.weighbridge.id}` : ""}`}
          >
            Create ticket
          </Link>
          <Link
            className="text-link"
            to={`/maintenance/new?${kind === "device" ? `deviceId=${id}` : `weighbridgeId=${id}`}`}
          >
            Create maintenance
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {data?.device ? (
        <section className="identity-card">
          <p>
            <span>Status</span>
            <StatusPill value={data.device.status} />
          </p>
          <p>
            <span>Installation</span>
            {data.device.installationStatus}
          </p>
          <p>
            <span>Site</span>
            {data.device.site.name}
          </p>
        </section>
      ) : null}

      {data?.weighbridge ? (
        <section className="identity-card">
          <p>
            <span>Hardware</span>
            {data.weighbridge.hardwareStatus ?? "—"}
          </p>
          <p>
            <span>Site</span>
            {data.weighbridge.site.name}
          </p>
        </section>
      ) : null}

      <section className="panel-form">
        <h2>Tickets</h2>
        {(data?.tickets ?? []).length === 0 ? <p className="login-note">No related tickets.</p> : null}
        {(data?.tickets ?? []).map((ticket) => (
          <Link key={ticket.id} to={`/support/tickets/${ticket.id}`} className="identity-card">
            <strong>{ticket.ticketNumber}</strong>
            <StatusPill value={ticket.status} />
            <p>{ticket.subject}</p>
          </Link>
        ))}
      </section>

      <section className="panel-form">
        <h2>Maintenance</h2>
        {(data?.maintenance ?? []).length === 0 ? <p className="login-note">No maintenance records.</p> : null}
        {(data?.maintenance ?? []).map((record) => (
          <Link key={record.id} to={`/maintenance/${record.id}`} className="identity-card">
            <strong>{record.recordNumber}</strong>
            <StatusPill value={record.status} />
            <p>{record.reason}</p>
          </Link>
        ))}
      </section>

      <section className="panel-form">
        <h2>Existing health events</h2>
        {(data?.recentAlerts ?? []).length === 0 && (data?.recentAnomalies ?? []).length === 0 ? (
          <p className="login-note">No recent alerts or anomalies from existing monitoring.</p>
        ) : null}
        {(data?.recentAlerts ?? []).map((alert) => (
          <article key={alert.id} className="identity-card">
            <p>{alert.title}</p>
            <StatusPill value={alert.status} />
            <p>{formatDateTime(alert.createdAt)}</p>
          </article>
        ))}
        {(data?.maintenanceWindows ?? []).map((window) => (
          <article key={window.id} className="identity-card">
            <p>Window · {window.reason}</p>
            <StatusPill value={window.status} />
            <p>{formatDateTime(window.startedAt)}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
