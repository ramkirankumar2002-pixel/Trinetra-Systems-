import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  disableGateway,
  enableGateway,
  heartbeatAgeLabel,
  listGateways,
  testEdgeDevice,
  updateEdgeDevice,
  type PublicEdgeDevice,
  type PublicEdgeGateway,
} from "./api.ts";

export function GatewayManagementPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Array<PublicEdgeGateway & { devices: PublicEdgeDevice[] }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPermission(user, "gateway.manage");
  const canTicket = hasPermission(user, "support.ticket.create");
  const canMaintain = hasPermission(user, "support.maintenance.manage");

  async function refresh(): Promise<void> {
    const result = await listGateways();
    setItems(result.items);
    setSelectedId((current) => current ?? result.items[0]?.id ?? null);
  }

  useEffect(() => {
    void refresh().catch((caught: unknown) => {
      setError(isApiError(caught) ? caught.message : "Unable to load gateways");
    });
  }, []);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Gateway action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Edge</p>
          <h1>Edge Gateways</h1>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="login-note">{message}</p> : null}

      <section className="card-grid">
        {items.map((gateway) => (
          <article key={gateway.id} className="identity-card">
            <p>
              <span>Gateway</span>
              {gateway.code}
            </p>
            <p>
              <span>Site</span>
              {gateway.site.name}
            </p>
            <StatusPill value={gateway.status} />
            <p>
              <span>Last heartbeat</span>
              {heartbeatAgeLabel(gateway.lastHeartbeatAt)}
            </p>
            <p>
              <span>Connected devices</span>
              {gateway.connectedDeviceCount}
            </p>
            <p>
              <span>Software</span>
              {gateway.softwareVersion ?? "—"}
            </p>
            <div className="button-row">
              <button type="button" className="ghost-button" onClick={() => setSelectedId(gateway.id)}>
                View
              </button>
              {canManage ? (
                <>
                  <button
                    type="button"
                    disabled={busy || gateway.revoked}
                    onClick={() => void run(() => enableGateway(gateway.id), "Gateway enabled")}
                  >
                    Enable
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={busy || gateway.revoked}
                    onClick={() => void run(() => disableGateway(gateway.id), "Gateway disabled")}
                  >
                    Disable
                  </button>
                </>
              ) : null}
              {canTicket ? (
                <Link className="ghost-button" to={`/support/tickets/new?gatewayId=${gateway.id}&siteId=${gateway.site.id}&category=GATEWAY`}>
                  Create ticket
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      {selected ? (
        <section className="detail-panel">
          <h2>{selected.name}</h2>
          <p>
            <span>Platform</span> {selected.platform ?? "—"}
          </p>
          <p>
            <span>Build</span> {selected.buildEnvironment ?? "—"}
          </p>
          <p>
            <span>Last communication</span>{" "}
            {selected.lastCommunicationAt ? formatDateTime(selected.lastCommunicationAt) : "—"}
          </p>
          <p>
            <span>Last error</span> {selected.lastError ?? "—"}
          </p>

          <h3>Devices</h3>
          <div className="card-grid">
            {selected.devices.map((device) => (
              <article key={device.id} className="identity-card">
                <p>
                  <span>Device</span>
                  {device.code}
                </p>
                <p>
                  <span>Type</span>
                  {device.name}
                </p>
                <p>
                  <span>Class</span>
                  {device.deviceType.replaceAll("_", " ")}
                </p>
                <p>
                  <span>Provider</span>
                  {device.provider}
                </p>
                <p>
                  <span>Protocol</span>
                  {device.protocol ?? "—"}
                </p>
                <StatusPill value={device.status} />
                <p>
                  <span>Last communication</span>
                  {device.lastCommunicationAt ? formatDateTime(device.lastCommunicationAt) : "—"}
                </p>
                <p>
                  <span>Last error</span>
                  {device.lastError ?? "—"}
                </p>
                {canManage ? (
                  <div className="button-row">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => updateEdgeDevice(selected.id, device.id, { enabled: true }),
                          "Device enabled",
                        )
                      }
                    >
                      Enable
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => updateEdgeDevice(selected.id, device.id, { enabled: false }),
                          "Device disabled",
                        )
                      }
                    >
                      Disable
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => testEdgeDevice(selected.id, device.id), "Communication test completed")
                      }
                    >
                      Test
                    </button>
                  </div>
                ) : null}
                {canTicket || canMaintain || hasPermission(user, "support.ticket.read") ? (
                  <div className="button-row">
                    {canTicket ? (
                      <Link className="ghost-button" to={`/support/tickets/new?deviceId=${device.id}&gatewayId=${selected.id}&siteId=${selected.site.id}&category=DEVICE`}>
                        Create ticket
                      </Link>
                    ) : null}
                    {canMaintain ? (
                      <Link className="ghost-button" to={`/maintenance/new?deviceId=${device.id}&gatewayId=${selected.id}&siteId=${selected.site.id}`}>
                        Create maintenance
                      </Link>
                    ) : null}
                    {hasPermission(user, "support.ticket.read") ? (
                      <Link className="ghost-button" to={`/support/devices/${device.id}`}>
                        Service history
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
