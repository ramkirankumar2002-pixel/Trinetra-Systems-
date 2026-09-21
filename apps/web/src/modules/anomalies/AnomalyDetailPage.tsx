import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { getAnomaly, type PublicAnomalyObservation, type PublicWeightAnomaly } from "./api.ts";

export function AnomalyDetailPage() {
  const params = useParams();
  const id = params.id ?? "";
  const [event, setEvent] = useState<PublicWeightAnomaly | null>(null);
  const [timeline, setTimeline] = useState<PublicAnomalyObservation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id === "") {
      return;
    }
    void getAnomaly(id)
      .then((result) => {
        setEvent(result.event);
        setTimeline(result.timeline);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load anomaly");
      });
  }, [id]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Weight health</p>
          <h1>Weight anomaly</h1>
        </div>
        <Link to="/weighbridge/anomalies" className="primary-link">
          History
        </Link>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {event ? (
        <section className="panel-form">
          <h2>{event.title}</h2>
          <StatusPill value={event.status} />
          <p>{event.explanation}</p>
          <p>
            Weighbridge {event.weighbridge.code} · Observed {event.observedWeightKg ?? "—"} kg · Platform{" "}
            {event.platformState}
          </p>
          <p>Detected {formatDateTime(event.firstDetectedAt)}</p>
          <ol className="timeline-list">
            {timeline.map((item) => (
              <li key={item.id}>
                <strong>{formatDateTime(item.recordedAt)}</strong> {item.kind.replaceAll("_", " ")}
                {item.weightKg ? ` · ${item.weightKg} kg` : ""}
                {item.note ? ` — ${item.note}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
