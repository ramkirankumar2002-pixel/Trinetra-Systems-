import { useCallback, useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import {
  fetchOrganizationDirectory,
  organizationKindLabel,
  siteStatusLabel,
  updateOrganizationStatus,
  updateSiteStatus,
  type OrganizationDirectory,
} from "./api.ts";

export function OrganizationPage() {
  const { user } = useAuth();
  const [directory, setDirectory] = useState<OrganizationDirectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(user, "user.manage");

  const load = useCallback(async () => {
    const result = await fetchOrganizationDirectory();
    setDirectory(result.directory);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().catch((caught: unknown) => {
      if (!cancelled) {
        setError(isApiError(caught) ? caught.message : "Unable to load organization");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleOrgStatus(status: "ACTIVE" | "SUSPENDED"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await updateOrganizationStatus(status);
      await load();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to update organization");
    } finally {
      setBusy(false);
    }
  }

  async function handleSiteStatus(siteId: string, status: "ACTIVE" | "INACTIVE"): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await updateSiteStatus(siteId, status);
      await load();
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to update site");
    } finally {
      setBusy(false);
    }
  }

  if (!directory) {
    return (
      <main className="page-shell">
        <h1>Organization</h1>
        {error ? <p className="form-error">{error}</p> : <p>Loading organization…</p>}
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">{organizationKindLabel(directory.organization.kind)}</p>
          <h1>{directory.organization.name}</h1>
          <p>
            Status: {directory.organization.status}. This view is limited to your organization. Platform-wide
            tenants are not listed.
          </p>
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {canManage ? (
        <p className="button-row">
          <button type="button" disabled={busy || directory.organization.status === "ACTIVE"} onClick={() => void handleOrgStatus("ACTIVE")}>
            Resume operations
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={busy || directory.organization.status === "SUSPENDED"}
            onClick={() => void handleOrgStatus("SUSPENDED")}
          >
            Suspend operations
          </button>
        </p>
      ) : null}

      {directory.sites.map((site) => (
        <section key={site.id} className="identity-card tenant-site-card">
          <p>
            <span>Site</span>
            {site.name} ({site.code})
          </p>
          <p>
            <span>Status</span>
            {siteStatusLabel(site.status)} · {site.timezone} · {site.operationMode}
          </p>
          {canManage ? (
            <p className="button-row">
              <button type="button" disabled={busy || site.status === "ACTIVE"} onClick={() => void handleSiteStatus(site.id, "ACTIVE")}>
                Activate site
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={busy || site.status === "INACTIVE"}
                onClick={() => void handleSiteStatus(site.id, "INACTIVE")}
              >
                Deactivate site
              </button>
            </p>
          ) : null}
          <div className="tenant-tree">
            <h2>Weighbridges</h2>
            {site.weighbridges.length === 0 ? <p>No weighbridges.</p> : null}
            <ul>
              {site.weighbridges.map((row) => (
                <li key={row.id}>
                  {row.name} ({row.code}) {row.isActive ? "" : "— offline"}
                </li>
              ))}
            </ul>
            <h2>Gateways</h2>
            {site.gateways.length === 0 ? <p>No gateways.</p> : null}
            <ul>
              {site.gateways.map((row) => (
                <li key={row.id}>
                  {row.name} ({row.code}) {row.enabled ? "" : "— disabled"}
                </li>
              ))}
            </ul>
            <h2>Cameras</h2>
            {site.cameras.length === 0 ? <p>No cameras.</p> : null}
            <ul>
              {site.cameras.map((row) => (
                <li key={row.id}>
                  {row.name} · {row.purpose} {row.enabled ? "" : "— disabled"}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className="identity-card">
        <h2>Departments</h2>
        <ul>
          {directory.departments.map((department) => (
            <li key={department.id}>
              {department.name} ({department.code})
            </li>
          ))}
        </ul>
      </section>

      <section className="identity-card">
        <h2>Users</h2>
        <ul className="tenant-user-list">
          {directory.users.map((row) => (
            <li key={row.id}>
              <strong>{row.fullName}</strong> · {row.email}
              {row.isActive ? "" : " · inactive"}
              <br />
              {row.roles.map((role) => role.name).join(", ") || "No role"}
              {row.defaultSite ? ` · ${row.defaultSite.name}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
