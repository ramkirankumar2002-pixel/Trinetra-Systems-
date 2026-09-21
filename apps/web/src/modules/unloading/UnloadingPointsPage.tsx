import { useEffect, useState, type FormEvent } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listMaterials, type PublicMaterial } from "../materials/api.ts";
import {
  createAssignmentRule,
  createUnloadingPoint,
  listAssignmentRules,
  listSites,
  listUnloadingPoints,
  updateUnloadingPoint,
  type PublicAssignmentRule,
  type PublicUnloadingPoint,
} from "./api.ts";

export function UnloadingPointsPage() {
  const { user } = useAuth();
  const canAssign = hasPermission(user, "unloading.assign");
  const [points, setPoints] = useState<PublicUnloadingPoint[]>([]);
  const [rules, setRules] = useState<PublicAssignmentRule[]>([]);
  const [sites, setSites] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [siteId, setSiteId] = useState(user?.defaultSite?.id ?? "");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [rulePointId, setRulePointId] = useState("");
  const [ruleMaterialId, setRuleMaterialId] = useState("");
  const [rulePriority, setRulePriority] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  async function reload(): Promise<void> {
    try {
      const [pointResult, ruleResult, siteResult] = await Promise.all([
        listUnloadingPoints(new URLSearchParams({ includeInactive: "true" })),
        listAssignmentRules(),
        listSites(),
      ]);
      setPoints(pointResult.items);
      setRules(ruleResult.items);
      setSites(siteResult.items);
      try {
        const materialResult = await listMaterials(new URLSearchParams({ pageSize: "50" }));
        setMaterials(materialResult.items);
      } catch {
        setMaterials([]);
      }
      if (siteId === "" && siteResult.items[0]) {
        setSiteId(siteResult.items[0].id);
      }
      setError(null);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to load unloading points");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createUnloadingPoint({ siteId, code, name });
      setCode("");
      setName("");
      await reload();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to create unloading point");
    } finally {
      setBusy(false);
    }
  }

  async function handleRule(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const point = points.find((item) => item.id === rulePointId);
    if (!point) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createAssignmentRule({
        siteId: point.site.id,
        unloadingPointId: point.id,
        priority: Number(rulePriority),
        ...(ruleMaterialId === "" ? {} : { materialId: ruleMaterialId }),
      });
      setRuleMaterialId("");
      await reload();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to create assignment rule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Yard configuration</p>
          <h1>Unloading points</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {canAssign ? (
        <form className="panel-form" onSubmit={(event) => void handleCreate(event)}>
          <h2>Add unloading point</h2>
          <label htmlFor="pointSite">Site</label>
          <select id="pointSite" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <label htmlFor="pointCode">Code</label>
          <input id="pointCode" value={code} onChange={(event) => setCode(event.target.value)} placeholder="UP-04" />
          <label htmlFor="pointName">Name</label>
          <input id="pointName" value={name} onChange={(event) => setName(event.target.value)} placeholder="Unloading Point 04" />
          <button type="submit" disabled={busy || siteId === "" || code === "" || name === ""}>
            Create point
          </button>
        </form>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Site</th>
              <th>Status</th>
              {canAssign ? <th>Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id}>
                <td>{point.code}</td>
                <td>{point.name}</td>
                <td>{point.site.name}</td>
                <td>
                  <StatusPill value={point.status} />
                </td>
                {canAssign ? (
                  <td>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() =>
                        void updateUnloadingPoint(point.id, {
                          isActive: !point.isActive,
                          status: point.isActive ? "INACTIVE" : "AVAILABLE",
                        }).then(() => reload())
                      }
                    >
                      {point.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="panel-form">
        <h2>Assignment rules</h2>
        <p className="login-note">
          Rules are configurable. The engine does not hard-code a material to a bay.
        </p>
        {canAssign ? (
          <form onSubmit={(event) => void handleRule(event)}>
            <label htmlFor="rulePoint">Unloading point</label>
            <select id="rulePoint" value={rulePointId} onChange={(event) => setRulePointId(event.target.value)}>
              <option value="">Choose point</option>
              {points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.code} · {point.site.name}
                </option>
              ))}
            </select>
            <label htmlFor="ruleMaterial">Material (optional)</label>
            <select id="ruleMaterial" value={ruleMaterialId} onChange={(event) => setRuleMaterialId(event.target.value)}>
              <option value="">Any material at this site</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} ({material.code})
                </option>
              ))}
            </select>
            <label htmlFor="rulePriority">Priority (lower runs first)</label>
            <input id="rulePriority" value={rulePriority} onChange={(event) => setRulePriority(event.target.value)} />
            <button type="submit" disabled={busy || rulePointId === ""}>
              Add rule
            </button>
          </form>
        ) : null}
        <ul className="step-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <strong>
                {rule.material ? `${rule.material.name} (${rule.material.code})` : "Any material"} → {rule.unloadingPoint.code}
              </strong>
              <span>
                {rule.site.name} · priority {rule.priority}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
