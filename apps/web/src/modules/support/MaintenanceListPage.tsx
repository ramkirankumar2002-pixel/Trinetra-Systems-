import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listMaintenance, type PublicMaintenance } from "./api.ts";

const STATUSES = ["", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

export function MaintenanceListPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<PublicMaintenance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canCreate = hasPermission(user, "support.maintenance.manage");

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim() !== "") params.set("q", q.trim());
    if (status !== "") params.set("status", status);
    void listMaintenance(params)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load maintenance"));
  }, [page, q, status]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Maintenance</p>
          <h1>Service history</h1>
        </div>
        {canCreate ? (
          <Link to="/maintenance/new" className="text-link">
            Create maintenance
          </Link>
        ) : null}
      </header>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Record ID, reason, device, weighbridge" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((item) => (
            <option key={item || "all"} value={item}>
              {item === "" ? "All statuses" : item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <button type="submit">Filter</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="approval-card-list">
        {items.map((record) => (
          <Link key={record.id} to={`/maintenance/${record.id}`} className="identity-card approval-card">
            <div className="approval-card-head">
              <strong>{record.recordNumber}</strong>
              <StatusPill value={record.status} />
              <StatusPill value={record.type} />
            </div>
            <p>{record.reason}</p>
            <p>
              <span>Technician</span>
              {record.performedBy?.fullName ?? "—"}
            </p>
            <p>
              <span>Updated</span>
              {formatDateTime(record.updatedAt)}
            </p>
          </Link>
        ))}
      </div>

      {items.length === 0 && !error ? <p className="login-note">No maintenance records match these filters.</p> : null}

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
