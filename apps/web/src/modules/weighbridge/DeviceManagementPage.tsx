import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  disableHardwareDevice,
  enableHardwareDevice,
  listHardwareDevices,
  refreshHardwareDevice,
  testHardwareDevice,
  type PublicHardwareDevice,
} from "./api.ts";
import { WeightHealthPanel } from "../anomalies/WeightHealthPanel.tsx";
import { LiveWeightPanel } from "./LiveWeightPanel.tsx";

export function DeviceManagementPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PublicHardwareDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(user, "weighbridge.manage");
  const canTicket = hasPermission(user, "support.ticket.create");
  const canMaintain = hasPermission(user, "support.maintenance.manage");

  async function refresh(): Promise<void> {
    const result = await listHardwareDevices();
    setItems(result.items);
    setSelectedId((current) => current ?? result.items[0]?.weighbridgeId ?? null);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load devices");
    });
  }, []);

  const selected = items.find((item) => item.weighbridgeId === selectedId) ?? null;

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Device action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Hardware</p>
          <h1>Weighbridge devices</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      <section className="card-grid">
        {items.map((device) => (
          <article key={device.id} className="identity-card">
            <p>
              <span>Weighbridge</span>
              {device.weighbridgeCode}
            </p>
            <p>
              <span>Device</span>
              {device.deviceName}
            </p>
            <p>
              <span>Provider</span>
              {device.providerType}
            </p>
            <p>
              <span>Connection</span>
              {device.connectionType}
            </p>
            <StatusPill value={device.status} />
            <StatusPill value={device.healthy ? "HEALTHY" : "UNHEALTHY"} />
            <p>
              <span>Last reading</span>
              {device.lastWeightKg ?? "—"} {device.lastQuality ? `· ${device.lastQuality}` : ""}
            </p>
            <p>
              <span>Last communication</span>
              {device.lastCommunicationAt ? formatDateTime(device.lastCommunicationAt) : "—"}
            </p>
            <p>
              <span>Enabled</span>
              {device.enabled ? "Yes" : "No"}
            </p>
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setSelectedId(device.weighbridgeId)}>
                View
              </button>
              {canManage ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => enableHardwareDevice(device.weighbridgeId), "Device enabled")}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void run(() => disableHardwareDevice(device.weighbridgeId), "Device disabled")}
                  >
                    Disable
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await testHardwareDevice(device.weighbridgeId);
                        if (!result.ok) {
                          throw new Error(result.message);
                        }
                      }, "Connection test succeeded")
                    }
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy}
                    onClick={() => void run(() => refreshHardwareDevice(device.weighbridgeId), "Status refreshed")}
                  >
                    Refresh status
                  </button>
                </>
              ) : null}
              {canTicket ? (
                <Link className="ghost-button" to={`/support/tickets/new?weighbridgeId=${device.weighbridgeId}&siteId=${device.site.id}&category=WEIGHBRIDGE`}>
                  Create ticket
                </Link>
              ) : null}
              {canMaintain ? (
                <Link className="ghost-button" to={`/maintenance/new?weighbridgeId=${device.weighbridgeId}&siteId=${device.site.id}`}>
                  Create maintenance
                </Link>
              ) : null}
              {hasPermission(user, "support.ticket.read") ? (
                <Link className="ghost-button" to={`/support/weighbridges/${device.weighbridgeId}`}>
                  Service history
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {selected ? (
        <section className="panel-form">
          <h2>{selected.deviceName}</h2>
          <p className="login-note">
            Configuration is site-scoped. Real indicator host, port, serial, and Modbus maps come from the manufacturer.
            Credentials are not stored.
          </p>
          <LiveWeightPanel weighbridgeId={selected.weighbridgeId} />
          <WeightHealthPanel weighbridgeId={selected.weighbridgeId} />
          <p>
            <span>Provider</span> {selected.providerType} · {selected.connectionType}
          </p>
          <p>
            <span>Host / port</span> {selected.host ?? "—"} {selected.port ?? ""}
          </p>
          <p>
            <span>Serial</span> {selected.serialPort ?? "—"} {selected.baudRate ?? ""}
          </p>
          {selected.lastError ? <p className="form-error">{selected.lastError}</p> : null}
        </section>
      ) : null}
    </main>
  );
}
