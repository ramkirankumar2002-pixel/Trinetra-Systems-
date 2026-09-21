import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  acknowledgeConflict,
  formatSyncTime,
  listDeadLetters,
  listSyncConflicts,
  listSyncStatus,
  resolveConflict,
  type PublicDeadLetter,
  type PublicSyncConflict,
  type PublicSyncSnapshot,
} from "./api.ts";

export function SyncDashboardPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicSyncSnapshot[]>([]);
  const [conflicts, setConflicts] = useState<PublicSyncConflict[]>([]);
  const [deadLetters, setDeadLetters] = useState<PublicDeadLetter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const canManage = hasPermission(user, "sync.manage", "gateway.manage");

  async function refresh(): Promise<void> {
    const [status, conflictRows] = await Promise.all([listSyncStatus(), listSyncConflicts()]);
    setItems(status.items);
    setConflicts(conflictRows.items);
    if (canManage) {
      setDeadLetters((await listDeadLetters()).items);
    }
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load synchronization status");
    });
  }, [canManage]);

  const selected = items[0] ?? null;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Edge</p>
          <h1>Offline & Synchronization</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      {selected ? (
        <section className="sync-stat-grid">
          <article className="identity-card">
            <p>
              <span>Gateway</span>
              {selected.gatewayCode}
            </p>
            <p>
              <span>Connectivity</span>
              {selected.connectivityState}
            </p>
            <StatusPill value={selected.connectivityState} />
          </article>
          <article className="identity-card">
            <p>
              <span>Internet</span>
              {selected.internetStatus}
            </p>
            <p>
              <span>Backend</span>
              {selected.backendStatus}
            </p>
            <p>
              <span>Hardware</span>
              {selected.hardwareStatus}
            </p>
            <p>
              <span>Sync</span>
              {selected.syncStatus}
            </p>
          </article>
          <article className="identity-card">
            <p>
              <span>Queued</span>
              {selected.queued}
            </p>
            <p>
              <span>Syncing</span>
              {selected.syncing}
            </p>
            <p>
              <span>Synced</span>
              {selected.synced.toLocaleString()}
            </p>
            <p>
              <span>Failed</span>
              {selected.failed}
            </p>
            <p>
              <span>Dead letter</span>
              {selected.deadLetter}
            </p>
          </article>
          <article className="identity-card">
            <p>
              <span>Last successful sync</span>
              {formatSyncTime(selected.lastSuccessfulSyncAt)}
            </p>
            <p>
              <span>Next retry</span>
              {selected.nextRetryAt ? formatDateTime(selected.nextRetryAt) : "—"}
            </p>
            <p>
              <span>Last heartbeat</span>
              {formatSyncTime(selected.lastHeartbeatAt)}
            </p>
            <p>
              <span>Configuration</span>
              {selected.configStale ? "Refresh required" : selected.configVersion ?? "—"}
            </p>
          </article>
        </section>
      ) : (
        <p className="login-note">No Edge Gateway snapshot has been reported yet.</p>
      )}

      <section className="detail-panel">
        <h2>Conflicts</h2>
        <p>Conflicts are recorded, not automatically overwritten.</p>
        {conflicts.length === 0 ? <p>No open synchronization conflicts.</p> : null}
        {conflicts.map((conflict) => (
          <article key={conflict.id} className="identity-card">
            <p>
              <span>Local / central</span>
              {conflict.localState} / {conflict.centralState}
            </p>
            <p>{conflict.reason}</p>
            <p>{conflict.recommendedAction}</p>
            <StatusPill value={conflict.status} />
            {canManage && conflict.status !== "RESOLVED" ? (
              <div className="button-row">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    void acknowledgeConflict(conflict.id)
                      .then(() => refresh())
                      .then(() => setMessage("Conflict acknowledged. Central and local states were not changed."))
                      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Acknowledge failed"))
                  }
                >
                  Acknowledge
                </button>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Resolution note"
                />
                <button
                  type="button"
                  onClick={() =>
                    void resolveConflict(conflict.id, note)
                      .then(() => refresh())
                      .then(() => setMessage("Conflict marked resolved. No automatic overwrite was applied."))
                      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Resolve failed"))
                  }
                >
                  Record resolution
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {canManage ? (
        <section className="detail-panel">
          <h2>Dead letter</h2>
          {deadLetters.length === 0 ? <p>No permanently failed business events.</p> : null}
          {deadLetters.map((item) => (
            <article key={item.eventId} className="identity-card">
              <p>
                <span>Event</span>
                {item.eventId}
              </p>
              <p>
                <span>Type</span>
                {item.eventType}
              </p>
              <p>{item.error}</p>
              <p>{item.recommendedAction}</p>
            </article>
          ))}
        </section>
      ) : null}
    </main>
  );
}
