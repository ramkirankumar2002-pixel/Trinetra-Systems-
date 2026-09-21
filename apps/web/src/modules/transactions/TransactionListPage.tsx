import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listTransactions, type PublicTransaction } from "./api.ts";

const STATUSES = [
  "",
  "ARRIVED",
  "IDENTIFIED",
  "DOCUMENT_PENDING",
  "DOCUMENT_VERIFIED",
  "MATERIAL_CLASSIFIED",
  "FIRST_WEIGHMENT",
  "PENDING_APPROVAL",
  "APPROVED",
  "UNLOADING",
  "UNLOADED",
  "SECOND_WEIGHMENT",
  "COMPLETED",
  "EXCEPTION",
  "ON_HOLD",
  "REJECTED",
  "CANCELLED",
];

export function TransactionListPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [items, setItems] = useState<PublicTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (q.trim() !== "") params.set("q", q.trim());
    if (status !== "") params.set("status", status);
    if (from !== "") params.set("from", from);
    if (to !== "") params.set("to", to);

    void listTransactions(params)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load transactions");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [from, page, q, status, to]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">History</p>
          <h1>Transactions</h1>
        </div>
      </header>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Reference or vehicle" />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {STATUSES.map((item) => (
            <option key={item || "all"} value={item}>
              {item === "" ? "All statuses" : item.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <button type="submit">Filter</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Transaction</th>
              <th>Vehicle</th>
              <th>Arrival</th>
              <th>Weighbridge</th>
              <th>Status</th>
              <th>Gross</th>
              <th>Tare</th>
              <th>Net</th>
              <th>Unloading</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {items.map((transaction) => (
              <tr key={transaction.id}>
                <td>
                  <Link to={`/transactions/${transaction.id}`}>{transaction.referenceNumber}</Link>
                </td>
                <td>{transaction.vehicle?.displayRegistrationNumber ?? "—"}</td>
                <td>{formatDateTime(transaction.arrivedAt)}</td>
                <td>{transaction.weighbridge?.code ?? "—"}</td>
                <td>
                  {transaction.operationMode && transaction.operationMode !== "PRODUCTION" ? (
                    <StatusPill value={transaction.operationMode} />
                  ) : null}
                  <StatusPill value={transaction.status} />
                </td>
                <td>{formatKg(transaction.grossWeightKg)}</td>
                <td>{formatKg(transaction.tareWeightKg)}</td>
                <td>{formatKg(transaction.netWeightKg)}</td>
                <td>{transaction.unloading?.point?.code ?? "—"}</td>
                <td>{transaction.completedAt ? formatDateTime(transaction.completedAt) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pager">
        {total} transactions
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Previous
        </button>
        <button type="button" disabled={page * 20 >= total} onClick={() => setPage((current) => current + 1)}>
          Next
        </button>
      </p>
    </main>
  );
}
