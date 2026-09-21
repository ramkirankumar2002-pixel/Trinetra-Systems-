import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listUsage } from "./api.ts";

export function IntegrationUsagePage() {
  const [items, setItems] = useState<
    Array<{
      id: string;
      method: string;
      path: string;
      statusCode: number;
      durationMs: number;
      requestId: string;
      rateLimited: boolean;
      createdAt: string;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listUsage()
      .then((result) => setItems(result.items))
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load usage"));
  }, []);

  return (
    <section className="panel-form">
      <h2>API usage</h2>
      <p className="login-note">Request logs omit secrets, authorization headers, and document contents.</p>
      {error ? <p className="form-error">{error}</p> : null}
      {items.length === 0 ? <p className="login-note">No integration requests recorded.</p> : null}
      {items.map((item) => (
        <article key={item.id} className="identity-card">
          <strong>
            {item.method} {item.path}
          </strong>
          <StatusPill value={String(item.statusCode)} />
          {item.rateLimited ? <StatusPill value="RATE_LIMITED" /> : null}
          <p>{item.durationMs} ms</p>
          <p>{item.requestId}</p>
          <p>{formatDateTime(item.createdAt)}</p>
        </article>
      ))}
    </section>
  );
}
