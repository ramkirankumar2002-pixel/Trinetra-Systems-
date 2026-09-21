import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { emptyOverview, getOverview, type IntegrationOverview } from "./api.ts";

export function IntegrationOverviewPage() {
  const [data, setData] = useState<IntegrationOverview>(emptyOverview());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOverview()
      .then(setData)
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load integrations"));
  }, []);

  const kpis = [
    { label: "Active integrations", value: data.kpis.activeIntegrations },
    { label: "Suspended", value: data.kpis.suspendedIntegrations },
    { label: "API requests (24h)", value: data.kpis.requestCount24h },
    { label: "Failed webhook deliveries", value: data.kpis.failedDeliveries },
  ];

  return (
    <>
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
        <h2>Credential expiry warnings</h2>
        {data.expiringCredentials.length === 0 ? <p className="login-note">No credentials expiring in the next 14 days.</p> : null}
        {data.expiringCredentials.map((item) => (
          <Link key={item.id} to={`/integrations/applications/${item.applicationId}`} className="identity-card">
            <strong>{item.clientId}</strong>
            <p>{item.secretPrefix}…</p>
            <p>{item.expiresAt ? formatDateTime(item.expiresAt) : "—"}</p>
          </Link>
        ))}
      </section>
      <section className="panel-form">
        <h2>Recent API activity</h2>
        {data.recentActivity.length === 0 ? <p className="login-note">No integration API requests yet.</p> : null}
        {data.recentActivity.map((item) => (
          <article key={item.id} className="identity-card">
            <strong>
              {item.method} {item.path}
            </strong>
            <StatusPill value={String(item.statusCode)} />
            <p>{formatDateTime(item.createdAt)}</p>
            <p>{item.requestId}</p>
          </article>
        ))}
      </section>
      <section className="panel-form">
        <h2>Recent webhook deliveries</h2>
        {data.recentDeliveries.length === 0 ? <p className="login-note">No webhook deliveries yet.</p> : null}
        {data.recentDeliveries.map((item) => (
          <article key={item.id} className="identity-card">
            <strong>{item.eventType}</strong>
            <StatusPill value={item.status} />
            {item.isTest ? <StatusPill value="TEST" /> : null}
            <p>{item.destination}</p>
            <p>{item.failureReason ?? formatDateTime(item.createdAt)}</p>
          </article>
        ))}
      </section>
    </>
  );
}
