import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listDeliveries, type PublicDelivery } from "./api.ts";

export function IntegrationDeliveriesPage() {
  const [items, setItems] = useState<PublicDelivery[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listDeliveries()
      .then((result) => setItems(result.items))
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load deliveries"));
  }, []);

  return (
    <section className="panel-form">
      <h2>Webhook delivery history</h2>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length === 0 ? <p className="login-note">No deliveries recorded.</p> : null}
      {items.map((item) => (
        <article key={item.id} className="identity-card">
          <strong>{item.eventType}</strong>
          <StatusPill value={item.status} />
          {item.isTest ? <StatusPill value="TEST" /> : null}
          <p>{item.destination}</p>
          <p>
            Attempts {item.attemptCount}
            {item.responseStatus ? ` · HTTP ${item.responseStatus}` : ""}
          </p>
          <p>{item.lastAttemptAt ? formatDateTime(item.lastAttemptAt) : formatDateTime(item.createdAt)}</p>
          {item.failureReason ? <p>{item.failureReason}</p> : null}
        </article>
      ))}
    </section>
  );
}
