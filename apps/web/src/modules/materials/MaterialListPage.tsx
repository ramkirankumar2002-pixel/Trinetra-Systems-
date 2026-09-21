import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listMaterials, type PublicMaterial } from "./api.ts";

export function MaterialListPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PublicMaterial[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasPermission(user, "material.manage");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        includeInactive: "true",
      });
      if (q.trim() !== "") {
        params.set("q", q.trim());
      }

      try {
        const result = await listMaterials(params);
        if (!cancelled) {
          setItems(result.items);
          setTotal(result.total);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load materials");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, q]);

  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setPage(1);
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Master data</p>
          <h1>Materials</h1>
        </div>
        {canManage ? (
          <Link to="/materials/new" className="primary-link">
            Add material
          </Link>
        ) : null}
      </header>

      <form className="filter-bar" onSubmit={handleSearch}>
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search code or name" />
        <button type="submit">Search</button>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Unit</th>
              <th>Workflow</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((material) => (
              <tr key={material.id}>
                <td>
                  <Link to={`/materials/${material.id}`}>{material.code}</Link>
                </td>
                <td>{material.name}</td>
                <td>{material.unitOfMeasure}</td>
                <td>{material.defaultWorkflow?.workflow.code ?? "Not configured"}</td>
                <td>
                  <StatusPill value={material.isActive ? "AVAILABLE" : "OFFLINE"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="pager">
        {total} materials
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
