import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { fetchOperationalContext, type TenantSite } from "./api.ts";

export function SiteSwitcher() {
  const { user, switchSite } = useAuth();
  const [sites, setSites] = useState<TenantSite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchOperationalContext()
      .then((context) => {
        if (!cancelled) {
          setSites(context.sites);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load sites");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.defaultSite?.id]);

  if (!user || sites.length === 0) {
    return (
      <p className="site-switcher-current">
        Current site: {user?.defaultSite?.name ?? "Not assigned"}
      </p>
    );
  }

  const currentId = user.defaultSite?.id ?? "";

  async function handleChange(siteId: string): Promise<void> {
    if (siteId === currentId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await switchSite(siteId);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Unable to change site");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="site-switcher">
      <label htmlFor="active-site">Current site</label>
      {sites.length === 1 ? (
        <p className="site-switcher-current">{sites[0]?.name}</p>
      ) : (
        <select
          id="active-site"
          value={currentId}
          disabled={busy}
          onChange={(event) => void handleChange(event.target.value)}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
              {site.status === "INACTIVE" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      )}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
