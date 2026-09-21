import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { StatusPill } from "../../shared/ui/StatusPill.tsx";
import { listWeighbridges, type PublicWeighbridge } from "./api.ts";
import { LiveWeightPanel } from "./LiveWeightPanel.tsx";
import { OfflineBanner } from "../sync/OfflineBanner.tsx";

export function WeighbridgeDashboardPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicWeighbridge[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = hasPermission(user, "weighbridge.manage");

  useEffect(() => {
    void listWeighbridges()
      .then((result) => setItems(result.items))
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load weighbridges");
      });
  }, []);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Operations</p>
          <h1>Weighbridge</h1>
        </div>
        <div className="button-row">
          {canManage || hasPermission(user, "weighbridge.read") ? (
            <Link to="/weighbridge/devices" className="primary-link">
              Devices
            </Link>
          ) : null}
          {hasPermission(user, "sync.read", "gateway.read") ? (
            <Link to="/weighbridge/sync" className="primary-link">
              Sync
            </Link>
          ) : null}
          {hasPermission(user, "camera.read", "weighbridge.read") ? (
            <Link to="/weighbridge/cameras" className="primary-link">
              Cameras
            </Link>
          ) : null}
          {hasPermission(user, "anomaly.read", "weighbridge.read") ? (
            <Link to="/weighbridge/anomalies" className="primary-link">
              Anomalies
            </Link>
          ) : null}
          <Link to="/weighbridge/arrival" className="primary-link">
            Vehicle arrival
          </Link>
          {hasPermission(user, "driver.mode") ? (
            <Link to="/weighbridge/driver" className="primary-link">
              Driver mode
            </Link>
          ) : null}
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      <OfflineBanner />

      <section className="card-grid">
        {items.map((weighbridge) => (
          <article key={weighbridge.id} className="identity-card">
            <p>
              <span>Weighbridge</span>
              {weighbridge.code}
            </p>
            <p>
              <span>Name</span>
              {weighbridge.name}
            </p>
            <p>
              <span>Site</span>
              {weighbridge.site.name}
            </p>
            <StatusPill value={weighbridge.operationalStatus} />
            {weighbridge.hardware ? (
              <>
                <p>
                  <span>Device</span>
                  {weighbridge.hardware.providerType} · {weighbridge.hardware.status}
                </p>
                <LiveWeightPanel weighbridgeId={weighbridge.id} />
              </>
            ) : null}
            {weighbridge.camera ? (
              <p>
                <span>Entry camera</span>
                {weighbridge.camera.name} · {weighbridge.camera.status}
                {weighbridge.camera.simulated ? " · SIMULATED" : ""}
              </p>
            ) : null}
            <Link to={`/weighbridge/arrival?weighbridgeId=${weighbridge.id}`} className="text-link">
              Start arrival
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
