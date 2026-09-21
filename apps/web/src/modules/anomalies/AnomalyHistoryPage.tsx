import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  acknowledgeAnomaly,
  anomalyTypeLabel,
  getAnomaly,
  listAnomalies,
  markFalsePositive,
  resolveAnomaly,
  type PublicAnomalyObservation,
  type PublicWeightAnomaly,
} from "./api.ts";

const TYPES = [
  "EMPTY_PLATFORM_WEIGHT",
  "SUDDEN_WEIGHT_CHANGE",
  "REPEATED_INSTABILITY",
  "WEIGHT_JUMP",
  "NEGATIVE_OR_INVALID_WEIGHT",
];
const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"];
const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"];

export function AnomalyHistoryPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<PublicWeightAnomaly[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicWeightAnomaly | null>(null);
  const [timeline, setTimeline] = useState<PublicAnomalyObservation[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const siteId = searchParams.get("siteId") ?? "";
  const weighbridgeId = searchParams.get("weighbridgeId") ?? "";
  const type = searchParams.get("type") ?? "";
  const severity = searchParams.get("severity") ?? "";
  const status = searchParams.get("status") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const canAcknowledge = hasPermission(user, "anomaly.acknowledge", "security.acknowledge");
  const canResolve = hasPermission(user, "anomaly.resolve");

  useEffect(() => {
    const search = new URLSearchParams();
    if (siteId) search.set("siteId", siteId);
    if (weighbridgeId) search.set("weighbridgeId", weighbridgeId);
    if (type) search.set("type", type);
    if (severity) search.set("severity", severity);
    if (status) search.set("status", status);
    if (from) search.set("from", from);
    if (to) search.set("to", to);
    search.set("page", String(page));
    search.set("pageSize", "20");
    void listAnomalies(search)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load anomalies");
      });
  }, [siteId, weighbridgeId, type, severity, status, from, to, page]);

  async function openEvent(id: string): Promise<void> {
    const result = await getAnomaly(id);
    setSelected(result.event);
    setTimeline(result.timeline);
    setReason("");
  }

  async function run(action: () => Promise<{ event: PublicWeightAnomaly }>): Promise<void> {
    setBusy(true);
    try {
      const result = await action();
      setSelected(result.event);
      const detail = await getAnomaly(result.event.id);
      setTimeline(detail.timeline);
      setItems((current) => current.map((item) => (item.id === result.event.id ? result.event : item)));
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  function setFilter(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value === "") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next);
    setPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Weight health</p>
          <h1>Weight anomalies</h1>
          <p className="login-note">
            These events identify abnormal measurement behavior. They do not independently prove fraud or physical
            tampering.
          </p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <form className="filter-grid">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFilter("from", event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setFilter("to", event.target.value)} />
        </label>
        <label>
          Type
          <select value={type} onChange={(event) => setFilter("type", event.target.value)}>
            <option value="">All types</option>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {anomalyTypeLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Severity
          <select value={severity} onChange={(event) => setFilter("severity", event.target.value)}>
            <option value="">All severities</option>
            {SEVERITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setFilter("status", event.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </form>

      <section className="dashboard-panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date/time</th>
                <th>Weighbridge</th>
                <th>Type</th>
                <th>Observed</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Occurrences</th>
                <th>Transaction</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.id.slice(-8)}</td>
                  <td>{formatDateTime(item.firstDetectedAt)}</td>
                  <td>{item.weighbridge.code}</td>
                  <td>{anomalyTypeLabel(item.type)}</td>
                  <td>{item.observedWeightKg ?? "—"} kg</td>
                  <td>{item.severity}</td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  <td>{item.durationMs === null ? "—" : `${Math.round(item.durationMs / 1000)}s`}</td>
                  <td>{item.occurrenceCount}</td>
                  <td>
                    {item.transactionId ? (
                      <Link to={`/transactions/${item.transactionId}`} className="text-link">
                        {item.transactionReference}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <button type="button" className="text-link" onClick={() => void openEvent(item.id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="refresh-meta">
          {total} events
          {total > 20 ? (
            <>
              {" "}
              <button type="button" className="text-link" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                Previous
              </button>{" "}
              <button
                type="button"
                className="text-link"
                disabled={page * 20 >= total}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </>
          ) : null}
        </p>
      </section>

      {selected ? (
        <section className="panel-form">
          <h2>{selected.title}</h2>
          <p>{selected.explanation}</p>
          <p>
            <span>Observed</span> {selected.observedWeightKg ?? "—"} kg · Previous {selected.previousWeightKg ?? "—"} kg
          </p>
          <p>
            <span>Platform</span> {selected.platformState} · {selected.detectionSource}
          </p>
          {selected.recoveredAt ? <p>Recovered {formatDateTime(selected.recoveredAt)}</p> : null}
          <ol className="timeline-list">
            {timeline.map((item) => (
              <li key={item.id}>
                <strong>{formatDateTime(item.recordedAt)}</strong> {item.kind.replaceAll("_", " ")}
                {item.weightKg ? ` · ${item.weightKg} kg` : ""} {item.note ? ` — ${item.note}` : ""}
              </li>
            ))}
          </ol>
          {selected.status === "OPEN" || selected.status === "ACKNOWLEDGED" ? (
            <div className="button-row">
              <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review reason" />
              {canAcknowledge && selected.status === "OPEN" ? (
                <button type="button" disabled={busy} onClick={() => void run(() => acknowledgeAnomaly(selected.id, reason || undefined))}>
                  Acknowledge
                </button>
              ) : null}
              {canResolve ? (
                <>
                  <button type="button" disabled={busy} onClick={() => void run(() => resolveAnomaly(selected.id, reason || undefined))}>
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy || reason.trim() === ""}
                    onClick={() => void run(() => markFalsePositive(selected.id, reason))}
                  >
                    False positive
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
