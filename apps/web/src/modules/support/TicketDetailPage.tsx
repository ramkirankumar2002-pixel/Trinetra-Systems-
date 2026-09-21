import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  addTicketComment,
  assignTicket,
  canShowInternalNote,
  changeTicketPriority,
  changeTicketStatus,
  closeTicket,
  getTicket,
  listAssignees,
  type PublicSupportTicket,
  type UserRef,
} from "./api.ts";

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<PublicSupportTicket | null>(null);
  const [assignees, setAssignees] = useState<UserRef[]>([]);
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canMaintain = hasPermission(user, "support.maintenance.manage");

  async function refresh(): Promise<void> {
    const result = await getTicket(id);
    setTicket(result.ticket);
    setResolution(result.ticket.resolutionSummary ?? "");
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load ticket"));
    if (hasPermission(user, "support.ticket.manage")) {
      void listAssignees()
        .then((result) => setAssignees(result.items))
        .catch(() => undefined);
    }
  }, [id, user]);

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

  function handleComment(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await addTicketComment(id, { body: comment, internal });
      setComment("");
      setInternal(false);
    });
  }

  if (!ticket) {
    return (
      <main className="page-shell">
        {error ? <p className="form-error">{error}</p> : <p className="login-note">Loading ticket…</p>}
      </main>
    );
  }

  const visibleActivities = ticket.activities.filter((activity) => canShowInternalNote(activity, ticket.canSeeInternal));

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{ticket.ticketNumber}</p>
          <h1>{ticket.subject}</h1>
        </div>
        <div className="button-row">
          <StatusPill value={ticket.status} />
          <StatusPill value={ticket.priority} />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="identity-card">
        <p>
          <span>Site</span>
          {ticket.site.name}
        </p>
        <p>
          <span>Category</span>
          {ticket.category.replaceAll("_", " ")}
        </p>
        <p>
          <span>Created by</span>
          {ticket.createdBy.fullName} · {formatDateTime(ticket.createdAt)}
        </p>
        <p>
          <span>Assigned</span>
          {ticket.assignedUser?.fullName ?? ticket.assignedTeam ?? "Unassigned"}
        </p>
        {ticket.weighbridge ? (
          <p>
            <span>Weighbridge</span>
            <Link to={`/support/weighbridges/${ticket.weighbridge.id}`}>{ticket.weighbridge.name}</Link>
          </p>
        ) : null}
        {ticket.device ? (
          <p>
            <span>Device</span>
            <Link to={`/support/devices/${ticket.device.id}`}>{ticket.device.name}</Link>
          </p>
        ) : null}
        {ticket.transaction ? (
          <p>
            <span>Transaction</span>
            <Link to={`/transactions/${ticket.transaction.id}`}>{ticket.transaction.referenceNumber}</Link>
          </p>
        ) : null}
        <p>{ticket.description}</p>
        {ticket.resolutionSummary ? (
          <p>
            <span>Resolution</span>
            {ticket.resolutionSummary}
          </p>
        ) : null}
      </section>

      {ticket.canManage ? (
        <section className="panel-form">
          <h2>Support actions</h2>
          <label>
            Assign
            <select
              disabled={busy}
              value={ticket.assignedUser?.id ?? ""}
              onChange={(event) => void run(() => assignTicket(id, { assignedUserId: event.target.value || null }))}
            >
              <option value="">Unassigned</option>
              {assignees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fullName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select disabled={busy} value={ticket.priority} onChange={(event) => void run(() => changeTicketPriority(id, event.target.value))}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="button-row">
            {ticket.allowedTransitions.map((status) => (
              <button
                key={status}
                type="button"
                className="ghost-button"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    changeTicketStatus(id, {
                      status,
                      expectedStatus: ticket.status,
                      ...(status === "RESOLVED" ? { resolutionSummary: resolution } : {}),
                    }),
                  )
                }
              >
                {status.replaceAll("_", " ")}
              </button>
            ))}
          </div>
          <label>
            Resolution summary
            <textarea value={resolution} onChange={(event) => setResolution(event.target.value)} rows={3} />
          </label>
          {canMaintain ? (
            <Link className="text-link" to={`/maintenance/new?ticketId=${ticket.id}&siteId=${ticket.site.id}${ticket.device ? `&deviceId=${ticket.device.id}` : ""}${ticket.weighbridge ? `&weighbridgeId=${ticket.weighbridge.id}` : ""}`}>
              Create maintenance from ticket
            </Link>
          ) : null}
        </section>
      ) : null}

      {!ticket.canManage && ticket.status === "RESOLVED" && ticket.canComment ? (
        <button type="button" disabled={busy} onClick={() => void run(() => closeTicket(id))}>
          Confirm resolution and close
        </button>
      ) : null}

      <section className="panel-form">
        <h2>Activity</h2>
        {visibleActivities.length === 0 ? <p className="login-note">No customer-visible activity yet.</p> : null}
        {visibleActivities.map((activity) => (
          <article key={activity.id} className="identity-card">
            <p>
              <span>{activity.type.replaceAll("_", " ")}</span>
              {activity.visibility === "INTERNAL" ? "Internal" : "Customer visible"}
            </p>
            <p>{activity.description}</p>
            <p>
              {activity.actor.fullName} · {formatDateTime(activity.createdAt)}
            </p>
          </article>
        ))}
        {ticket.canComment ? (
          <form onSubmit={handleComment}>
            <label>
              Comment
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={4} required />
            </label>
            {ticket.canSeeInternal ? (
              <label>
                <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} /> Internal note
              </label>
            ) : null}
            <button type="submit" disabled={busy}>
              Add comment
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
