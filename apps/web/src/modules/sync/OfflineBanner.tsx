import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { listSyncStatus, offlineBannerText, type PublicSyncSnapshot } from "./api.ts";

export function OfflineBanner() {
  const [snapshot, setSnapshot] = useState<PublicSyncSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSyncStatus()
      .then((result) => {
        if (!cancelled) {
          setSnapshot(result.items[0] ?? null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error || !snapshot) {
    return null;
  }
  const message = offlineBannerText(snapshot);
  if (!message) {
    return null;
  }

  return (
    <aside className="offline-banner" role="status">
      <p className="login-kicker">Offline mode</p>
      <p>{message}</p>
      <p>
        Internet {snapshot.internetStatus} · Backend {snapshot.backendStatus} · Hardware {snapshot.hardwareStatus} · Sync{" "}
        {snapshot.syncStatus}
      </p>
    </aside>
  );
}
