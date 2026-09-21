import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listApprovals, type PublicApproval } from "./api.ts";

const STATUSES = ["", "PENDING", "APPROVED", "REJECTED", "CANCELLED"];

export function ApprovalListPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("PENDING");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [department, setDepartment] = useState("");
  const [items, setItems] = useState<PublicApproval[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim() !== "") params.set("q", q.trim());
    if (status !== "") params.set("status", status);
    if (from !== "") params.set("from", from);
    if (to !== "") params.set("to", to);
    if (department !== "") params.set("departmentId", department);

    void listApprovals(params)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setPendingCount(result.pendingCount);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load approvals");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [department, from, page, q, reloadToken, status, to]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setReloadToken((current) => current + 1);
  }

  const departments = [...new Map(items.map((item) => [item.department.id, item.department])).values()];

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Approval queue</p>
          <h1>Approvals</h1>
        </div>
        <p className="login-note">{pendingCount} pending</p>
      </header>

      <form className="filter-bar approval-filters" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Transaction or vehicle" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((item) => (
            <option key={item || "all"} value={item}>
              {item === "" ? "All statuses" : item}
            </option>
          ))}
        </select>
        <select value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button type="submit">Filter</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="approval-card-list">
        {items.map((approval) => (
          <Link key={approval.id} to={`/approvals/${approval.id}`} className="identity-card approval-card">
            <div className="approval-card-head">
              <strong>{approval.transaction.referenceNumber}</strong>
              <StatusPill value={approval.status} />
            </div>
            <p>
              <span>Vehicle</span>
              {approval.transaction.vehicleNumber ?? "—"}
            </p>
            <p>
              <span>Material</span>
              {approval.transaction.material?.name ?? "—"}
            </p>
            <p>
              <span>Department</span>
              {approval.department.name}
            </p>
            <p>
              <span>Gross</span>
              {formatKg(approval.transaction.grossWeightKg)}
            </p>
            <p>
              <span>Requested</span>
              {formatDateTime(approval.requestedAt)}
            </p>
          </Link>
        ))}
      </div>

      {items.length === 0 && !error ? <p className="login-note">No approval requests match these filters.</p> : null}

      <div className="pager">
        <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </button>
        <span>
          Page {page} · {total} total
        </span>
        <button
          type="button"
          className="ghost-button"
          disabled={page * 20 >= total}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </button>
      </div>
    </main>
  );
}
