import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { createApplication, getCatalog, listApplications, type IntegrationCatalog, type PublicApplication } from "./api.ts";

export function IntegrationApplicationsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "integration.manage");
  const [items, setItems] = useState<PublicApplication[]>([]);
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("TEST");

  async function reload(): Promise<void> {
    const [apps, cat] = await Promise.all([listApplications(), getCatalog()]);
    setItems(apps.items);
    setCatalog(cat);
  }

  useEffect(() => {
    void reload().catch((caught: unknown) => setError(isApiError(caught) ? caught.message : "Unable to load applications"));
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    try {
      await createApplication({ name, description, environment, scopes: catalog?.defaultScopes ?? ["ORGANIZATION_READ"] });
      setName("");
      setDescription("");
      await reload();
      setError(null);
    } catch (caught: unknown) {
      setError(isApiError(caught) ? caught.message : "Unable to create application");
    }
  }

  return (
    <>
      {error ? <p className="form-error">{error}</p> : null}
      {canManage ? (
        <form className="panel-form" onSubmit={(event) => void handleCreate(event)}>
          <h2>Create application</h2>
          <p className="login-note">New applications receive the minimum default scope until you add more.</p>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Description
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Environment
            <select value={environment} onChange={(event) => setEnvironment(event.target.value)}>
              <option value="TEST">TEST</option>
              <option value="PRODUCTION">PRODUCTION</option>
            </select>
          </label>
          <button type="submit">Create</button>
        </form>
      ) : null}
      <section className="approval-card-list">
        {items.length === 0 ? <p className="login-note">No integration applications for this organization.</p> : null}
        {items.map((item) => (
          <Link key={item.id} to={`/integrations/applications/${item.id}`} className="identity-card approval-card">
            <strong>{item.name}</strong>
            <StatusPill value={item.status} />
            <StatusPill value={item.environment} />
            <p>{item.description ?? "No description"}</p>
            <p>
              {item.credentialCount} credentials · {item.webhookCount} webhooks
            </p>
          </Link>
        ))}
      </section>
    </>
  );
}
