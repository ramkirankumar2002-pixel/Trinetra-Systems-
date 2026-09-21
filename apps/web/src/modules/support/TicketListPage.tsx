import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listTickets, type PublicTicketSummary } from "./api.ts";

const STATUSES = ["", "OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "WAITING_FOR_MAINTENANCE", "RESOLVED", "CLOSED", "CANCELLED"];
const PRIORITIES = ["", "LOW", "MEDIUM", "HIGH", "CRITICAL"];

export function TicketListPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [items, setItems] = useState<PublicTicketSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canCreate = hasPermission(user, "support.ticket.create");

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim() !== "") params.set("q", q.trim());
    if (status !== "") params.set("status", status);
    if (priority !== "") params.set("priority", priority);
    void listTickets(params)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load tickets"));
  }, [page, priority, q, status]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Support</p>
          <h1>Tickets</h1>
        </div>
        {canCreate ? (
          <Link to="/support/tickets/new" className="text-link">
            Create ticket
          </Link>
        ) : null}
      </header>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Ticket ID, subject, device, weighbridge" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((item) => (
            <option key={item || "all"} value={item}>
              {item === "" ? "All statuses" : item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value)}>
          {PRIORITIES.map((item) => (
            <option key={item || "all"} value={item}>
              {item === "" ? "All priorities" : item}
            </option>
          ))}
        </select>
        <button type="submit">Filter</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="approval-card-list">
        {items.map((ticket) => (
          <Link key={ticket.id} to={`/support/tickets/${ticket.id}`} className="identity-card approval-card">
            <div className="approval-card-head">
              <strong>{ticket.ticketNumber}</strong>
              <StatusPill value={ticket.status} />
              <StatusPill value={ticket.priority} />
            </div>
            <p>{ticket.subject}</p>
            <p>
              <span>Site</span>
              {ticket.site.name}
            </p>
            <p>
              <span>Updated</span>
              {formatDateTime(ticket.updatedAt)}
            </p>
          </Link>
        ))}
      </div>

      {items.length === 0 && !error ? <p className="login-note">No tickets match these filters.</p> : null}

      <div className="pager">
        <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </button>
        <span>
          Page {page} · {total} total
        </span>
        <button type="button" className="ghost-button" disabled={page * 20 >= total} onClick={() => setPage((current) => current + 1)}>
          Next
        </button>
      </div>
    </main>
  );
}
