import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listVehicles, type PublicVehicle } from "./api.ts";

export function VehicleListPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [transporter, setTransporter] = useState("");
  const [supplier, setSupplier] = useState("");
  const [items, setItems] = useState<PublicVehicle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasPermission(user, "vehicle.manage");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        includeInactive: "true",
      });
      if (q.trim() !== "") params.set("q", q.trim());
      if (transporter.trim() !== "") params.set("transporter", transporter.trim());
      if (supplier.trim() !== "") params.set("supplier", supplier.trim());

      try {
        const result = await listVehicles(params);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load vehicles");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, q, supplier, transporter]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
    setQ(q);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Master data</p>
          <h1>Vehicles</h1>
        </div>
        {canManage ? (
          <Link to="/vehicles/new" className="primary-link">
            Add vehicle
          </Link>
        ) : null}
      </header>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Vehicle number" />
        <input
          value={transporter}
          onChange={(event) => setTransporter(event.target.value)}
          placeholder="Transporter"
        />
        <input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Supplier" />
        <button type="submit">Search</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Transporter</th>
              <th>Supplier</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>
                  <Link to={`/vehicles/${vehicle.id}`}>{vehicle.displayRegistrationNumber}</Link>
                </td>
                <td>{vehicle.vehicleType ?? "—"}</td>
                <td>{vehicle.transporterName ?? "—"}</td>
                <td>{vehicle.supplier?.name ?? "—"}</td>
                <td>
                  <StatusPill value={vehicle.isActive ? "AVAILABLE" : "OFFLINE"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pager">
        {total} vehicles
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
