import { useEffect, useState } from "react";
import { isApiError } from "../../shared/api/client.ts";
import { formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import { getLiveWeight, sourceLabel, type LiveWeightResponse } from "./api.ts";

export function LiveWeightPanel({
  weighbridgeId,
  pollMs = 1000,
}: {
  weighbridgeId: string | null | undefined;
  pollMs?: number;
}) {
  const [live, setLive] = useState<LiveWeightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weighbridgeId) {
      return;
    }
    const id = weighbridgeId;

    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const next = await getLiveWeight(id);
        if (!cancelled) {
          setLive(next);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Live weight is unavailable");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [weighbridgeId, pollMs]);

  if (!weighbridgeId) {
    return null;
  }

  const quality = live?.reading.quality ?? "NO_DATA";
  const weightText = live?.reading.weightKg ? formatKg(live.reading.weightKg) : "—";

  return (
    <article className={`live-weight-panel quality-${quality.toLowerCase()}`} aria-live="polite">
      <p className="login-kicker">Live weight</p>
      <p className="live-weight-value">{weightText}</p>
      <p>
        <StatusPill value={quality} />
        <StatusPill value={live?.device.status ?? "DISCONNECTED"} />
      </p>
      <p>
        <span>Device</span>
        {live?.device.deviceIdentifier ?? "—"}
      </p>
      <p>
        <span>Updated</span>
        {live?.reading.timestamp ? new Date(live.reading.timestamp).toLocaleTimeString("en-IN") : "—"}
      </p>
      <p>
        <span>Source</span>
        {sourceLabel(live?.reading.source ?? "SIMULATOR")}
      </p>
      {error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}
