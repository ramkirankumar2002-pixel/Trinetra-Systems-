import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { emptyDashboard, getSupportDashboard, type SupportDashboard } from "./api.ts";

export function SupportDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<SupportDashboard>(emptyDashboard());
  const [error, setError] = useState<string | null>(null);
  const [siteId, setSiteId] = useState("");
  const canCreate = hasPermission(user, "support.ticket.create");
  const canMaintain = hasPermission(user, "support.maintenance.manage");

  useEffect(() => {
    const search = new URLSearchParams();
    if (siteId) search.set("siteId", siteId);
    void getSupportDashboard(search)
      .then(setData)
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load support dashboard"));
  }, [siteId]);

  function handleFilter(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
  }

  const kpis = [
    { label: "Open tickets", value: data.kpis.openTickets },
    { label: "Critical", value: data.kpis.criticalTickets },
    { label: "Awaiting response", value: data.kpis.awaitingResponse },
    { label: "In progress", value: data.kpis.inProgress },
    { label: "Resolved", value: data.kpis.resolvedTickets },
    { label: "Active maintenance", value: data.kpis.activeMaintenance },
  ];

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Customer support</p>
          <h1>Support dashboard</h1>
        </div>
        <div className="button-row">
          {canCreate ? <Link to="/support/tickets/new" className="text-link">Create ticket</Link> : null}
          {canMaintain ? <Link to="/maintenance/new" className="text-link">Create maintenance</Link> : null}
        </div>
      </header>

      <form className="filter-bar" onSubmit={handleFilter}>
        <input value={siteId} onChange={(event) => setSiteId(event.target.value)} placeholder="Site ID filter (optional)" />
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="card-grid">
        {kpis.map((item) => (
          <article key={item.label} className="identity-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="panel-form">
        <h2>Unresolved high-priority issues</h2>
        {data.unresolvedHighPriority.length === 0 ? <p className="login-note">No unresolved high-priority tickets.</p> : null}
        {data.unresolvedHighPriority.map((ticket) => (
          <Link key={ticket.id} to={`/support/tickets/${ticket.id}`} className="identity-card">
            <strong>{ticket.ticketNumber}</strong>
            <StatusPill value={ticket.priority} />
            <StatusPill value={ticket.status} />
            <p>{ticket.subject}</p>
          </Link>
        ))}
      </section>

      <section className="panel-form">
        <h2>Active maintenance</h2>
        {data.activeMaintenance.length === 0 ? <p className="login-note">No active maintenance.</p> : null}
        {data.activeMaintenance.map((record) => (
          <Link key={record.id} to={`/maintenance/${record.id}`} className="identity-card">
            <strong>{record.recordNumber}</strong>
            <StatusPill value={record.status} />
            <p>{record.reason}</p>
          </Link>
        ))}
      </section>

      <section className="panel-form">
        <h2>Recently completed maintenance</h2>
        {data.recentlyCompletedMaintenance.length === 0 ? <p className="login-note">No completed maintenance in this view.</p> : null}
        {data.recentlyCompletedMaintenance.map((record) => (
          <Link key={record.id} to={`/maintenance/${record.id}`} className="identity-card">
            <strong>{record.recordNumber}</strong>
            <p>{record.reason}</p>
            <p>
              <span>Completed</span>
              {record.completedAt ? formatDateTime(record.completedAt) : "—"}
            </p>
          </Link>
        ))}
      </section>

      <section className="panel-form">
        <h2>Devices with recent support issues</h2>
        {data.devicesWithRecentIssues.length === 0 ? <p className="login-note">No devices with open support tickets.</p> : null}
        {data.devicesWithRecentIssues.map((device) => (
          <Link key={device.id} to={`/support/devices/${device.id}`} className="identity-card">
            <strong>{device.code}</strong>
            <p>{device.name}</p>
            <p>
              <span>Open tickets</span>
              {device.openTickets}
            </p>
          </Link>
        ))}
      </section>
    </main>
  );
}
