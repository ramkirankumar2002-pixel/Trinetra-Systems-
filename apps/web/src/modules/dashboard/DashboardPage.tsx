import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatApiError } from "../../shared/api/errors.ts";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  getDashboard,
  getDashboardCharts,
  getDashboardLookups,
  type ChartPayload,
  type DashboardLookups,
  type DashboardPayload,
  type PublicDashboardTransaction,
} from "./api.ts";
import {
  approvalHref,
  buildDashboardSearch,
  dashboardViewState,
  EMPTY_COPY,
  presetToRange,
  visibleDashboardSections,
} from "./dashboardSections.ts";
import { anomalyTypeLabel } from "../anomalies/api.ts";
import { acknowledgeAlert, resolveAlert } from "../notifications/api.ts";
import { SimpleBarChart } from "./SimpleBarChart.tsx";
import { useDebouncedValue } from "./useDebouncedValue.ts";
import { getReliabilityStatus, type ReliabilityStatus } from "../reliability/api.ts";

const POLL_MS = 30_000;

export function DashboardPage() {
  const { user } = useAuth();
  const [vehicleInput, setVehicleInput] = useState("");
  const vehicle = useDebouncedValue(vehicleInput, 400);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [siteId, setSiteId] = useState("");
  const [weighbridgeId, setWeighbridgeId] = useState("");
  const [status, setStatus] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [workflowCode, setWorkflowCode] = useState("");
  const [lookups, setLookups] = useState<DashboardLookups | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [charts, setCharts] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [reliability, setReliability] = useState<ReliabilityStatus | null>(null);

  const search = buildDashboardSearch({
    from,
    to,
    siteId,
    weighbridgeId,
    status,
    vehicle,
    materialId,
    workflowCode,
    datePreset,
  });
  const searchKey = search.toString();

  useEffect(() => {
    void getDashboardLookups()
      .then(setLookups)
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load dashboard filters");
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getDashboard(search)
      .then(async (result) => {
        if (cancelled) {
          return;
        }
        setDashboard(result.dashboard);
        setError(null);
        setLastRefreshed(new Date().toISOString());
        if (hasPermission(user, "reliability.read")) {
          try {
            const recovery = await getReliabilityStatus();
            if (!cancelled) {
              setReliability(recovery.status);
            }
          } catch {
            if (!cancelled) {
              setReliability(null);
            }
          }
        }
        if (result.dashboard.capabilities.charts) {
          try {
            const chartResult = await getDashboardCharts(search);
            if (!cancelled) {
              setCharts(chartResult.charts);
            }
          } catch {
            if (!cancelled) {
              setCharts(null);
            }
          }
        } else {
          setCharts(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(formatApiError(caught, "Unable to load dashboard"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken, searchKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshToken((current) => current + 1);
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const viewState = dashboardViewState({
    loading,
    error,
    hasData: dashboard !== null,
  });
  const sections = visibleDashboardSections(dashboard?.capabilities ?? null);
  const weighbridges = (lookups?.weighbridges ?? []).filter((item) => siteId === "" || item.siteId === siteId);

  return (
    <main className="page-shell dashboard-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Operations</p>
          <h1>Management dashboard</h1>
          <p className="login-note">
            {dashboard
              ? `${dashboard.capabilities.view.replaceAll("_", " ")} view · ${dashboard.kpis.timezone} · today ${dashboard.kpis.todayDate}`
              : "Live weighbridge activity from the database"}
          </p>
        </div>
        <div className="dashboard-actions">
          {hasPermission(user, "report.read") ? (
            <Link to="/reports" className="primary-link">
              Reports
            </Link>
          ) : null}
          <button type="button" className="ghost-button" onClick={() => setRefreshToken((current) => current + 1)}>
            Refresh
          </button>
        </div>
      </header>

      <div className="report-presets" role="group" aria-label="Date range">
        {[
          { id: "today", label: "Today" },
          { id: "yesterday", label: "Yesterday" },
          { id: "last_7_days", label: "Last 7 days" },
          { id: "last_30_days", label: "Last 30 days" },
          { id: "current_month", label: "Current month" },
        ].map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={datePreset === preset.id ? "tab-active" : "ghost-button"}
            onClick={() => {
              setDatePreset(preset.id);
              const range = presetToRange(preset.id, dashboard?.kpis.timezone ?? lookups?.timezone ?? "Asia/Kolkata");
              setFrom(range.from);
              setTo(range.to);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form className="filter-bar dashboard-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setDatePreset("custom");
              setFrom(event.target.value);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setDatePreset("custom");
              setTo(event.target.value);
            }}
          />
        </label>
        <label>
          Site
          <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
            <option value="">All accessible sites</option>
            {lookups?.sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weighbridge
          <select value={weighbridgeId} onChange={(event) => setWeighbridgeId(event.target.value)}>
            <option value="">All weighbridges</option>
            {weighbridges.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {lookups?.statuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Material
          <select value={materialId} onChange={(event) => setMaterialId(event.target.value)}>
            <option value="">All materials</option>
            {lookups?.materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Workflow
          <select value={workflowCode} onChange={(event) => setWorkflowCode(event.target.value)}>
            <option value="">All workflow types</option>
            {lookups?.workflows.map((item) => (
              <option key={item.id} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vehicle
          <input
            value={vehicleInput}
            onChange={(event) => setVehicleInput(event.target.value)}
            placeholder="Vehicle or reference"
          />
        </label>
      </form>

      {lastRefreshed ? <p className="refresh-meta">Updated {formatDateTime(lastRefreshed)}</p> : null}
      {viewState === "loading" && !dashboard ? <p className="session-status">Loading dashboard…</p> : null}
      {viewState === "error" ? <p className="form-error">{error}</p> : null}

      {reliability && hasPermission(user, "reliability.read") ? (
        <section className="dashboard-panel" aria-label="Recovery status">
          <h2>System reliability</h2>
          <div className="kpi-grid">
            <KpiCard label="System status" value={reliability.systemStatus} />
            <KpiCard
              label="Database"
              value={reliability.dependencies.find((item) => item.name === "postgresql")?.status ?? "UNKNOWN"}
            />
            <KpiCard label="Backup status" value={reliability.backup.status.replaceAll("_", " ")} />
            <KpiCard label="Open recovery warnings" value={reliability.openRecoveryWarnings} tone={reliability.openRecoveryWarnings > 0 ? "alert" : "default"} />
            <KpiCard label="Stale transactions" value={reliability.staleTransactionCount} />
            <KpiCard label="Offline gateways" value={reliability.offlineGateways.length} />
          </div>
          <p>
            Last backup{" "}
            {reliability.backup.lastSuccessfulAt ? formatDateTime(reliability.backup.lastSuccessfulAt) : "has not been verified"}.{" "}
            <Link to="/reliability" className="text-link">
              Open recovery
            </Link>
          </p>
        </section>
      ) : null}

      {dashboard && sections.includes("kpis") ? (
        <section className="kpi-grid" aria-label="Operational totals">
          <KpiCard label="Total transactions" value={dashboard.kpis.totalTransactions} empty={dashboard.empty.kpis} />
          <KpiCard label="Today's transactions" value={dashboard.kpis.todayTransactions} hint={dashboard.kpis.todayDate} />
          <KpiCard label="Active transactions" value={dashboard.kpis.activeTransactions} />
          <KpiCard label="Completed transactions" value={dashboard.kpis.completedTransactions} />
          <KpiCard label="Pending approvals" value={dashboard.kpis.pendingApprovals} />
          <KpiCard label="Pending unloading" value={dashboard.kpis.pendingUnloading} />
          <KpiCard label="Exceptions" value={dashboard.kpis.exceptions} tone={dashboard.kpis.exceptions > 0 ? "alert" : "default"} />
          <KpiCard
            label="Total material weight"
            value={formatKg(dashboard.kpis.totalMaterialWeightKg)}
            hint="Completed net weight"
            empty={dashboard.kpis.completedTransactions === 0}
          />
          <KpiCard label="Vehicles identified today" value={dashboard.kpis.identifiedToday} />
          <KpiCard label="Manual identifications" value={dashboard.kpis.manualIdentificationsToday} />
          <KpiCard label="ANPR detection failures" value={dashboard.kpis.anprFailuresToday} />
          <KpiCard label="Unregistered vehicles" value={dashboard.kpis.unregisteredVehiclesToday} />
        </section>
      ) : null}

      {dashboard && sections.includes("charts") ? (
        <section className="chart-grid">
          <SimpleBarChart title="Transactions by status" rows={charts?.byStatus ?? []} />
          <SimpleBarChart title="Transactions by material" rows={charts?.byMaterial ?? []} />
          <SimpleBarChart title="Daily transaction volume" rows={charts?.dailyVolume ?? []} />
          <SimpleBarChart
            title="Net weight by day"
            rows={charts?.netWeightByDay ?? []}
            formatValue={(value) => formatKg(String(value))}
          />
          <SimpleBarChart
            title="Net weight by material"
            rows={charts?.netWeightByMaterial ?? []}
            formatValue={(value) => formatKg(String(value))}
          />
          <SimpleBarChart title="Transactions by site" rows={charts?.bySite ?? []} />
          <SimpleBarChart title="Exceptions" rows={charts?.exceptionCount ?? []} />
          <SimpleBarChart title="Approval status" rows={charts?.approvalStatus ?? []} />
          <SimpleBarChart title="Gateway status" rows={charts?.gatewayStatus ?? []} />
        </section>
      ) : null}

      {dashboard && sections.includes("live") ? (
        <DashboardTable
          title="Live transactions"
          empty={EMPTY_COPY.live}
          rows={dashboard.live}
          showStage
        />
      ) : null}

      {dashboard && sections.includes("recent") ? (
        <DashboardTable
          title="Recent transactions"
          empty={EMPTY_COPY.recent}
          rows={dashboard.recent}
          showCompleted
        />
      ) : null}

      {dashboard && sections.includes("pendingApprovals") ? (
        <section className="dashboard-panel">
          <h2>Pending approvals</h2>
          {dashboard.empty.pendingApprovals ? (
            <p className="empty-state">{EMPTY_COPY.pendingApprovals}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Vehicle</th>
                    <th>Material</th>
                    <th>Approval type</th>
                    <th>Requested by</th>
                    <th>Requested at</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.pendingApprovals.map((item) => (
                    <tr key={item.id}>
                      <td>{item.transaction.referenceNumber}</td>
                      <td>{item.transaction.vehicleNumber ?? "—"}</td>
                      <td>{item.transaction.material?.name ?? "—"}</td>
                      <td>{item.approvalType}</td>
                      <td>{item.requestedBy?.fullName ?? "—"}</td>
                      <td>{formatDateTime(item.requestedAt)}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <Link to={approvalHref(item.canOpenApproval, item.id, item.transaction.id)} className="text-link">
                          {item.canOpenApproval ? "Open approval" : "View details"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dashboard && sections.includes("pendingUnloading") ? (
        <section className="dashboard-panel">
          <h2>Pending unloading</h2>
          {dashboard.empty.pendingUnloading ? (
            <p className="empty-state">{EMPTY_COPY.pendingUnloading}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Material</th>
                    <th>Unloading point</th>
                    <th>Approval</th>
                    <th>Gross</th>
                    <th>Assigned</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.pendingUnloading.map((item) => (
                    <tr key={item.id}>
                      <td>{item.vehicleNumber ?? "—"}</td>
                      <td>{item.material?.name ?? "—"}</td>
                      <td>{item.unloadingPoint?.name ?? "Unassigned"}</td>
                      <td>{item.approvalStatus ?? "—"}</td>
                      <td>{formatKg(item.grossWeightKg)}</td>
                      <td>{item.assignedAt ? formatDateTime(item.assignedAt) : "—"}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <Link to={`/transactions/${item.id}`} className="text-link">
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dashboard && sections.includes("weightAnomalies") ? (
        <section className="dashboard-panel">
          <h2>Weight anomalies</h2>
          <div className="kpi-grid">
            <KpiCard label="Open anomalies" value={dashboard.weightAnomalies.open} />
            <KpiCard label="Today's anomalies" value={dashboard.weightAnomalies.today} />
            <KpiCard
              label="Critical anomalies"
              value={dashboard.weightAnomalies.critical}
              tone={dashboard.weightAnomalies.critical > 0 ? "alert" : "default"}
            />
            <KpiCard label="Repeated anomalies" value={dashboard.weightAnomalies.repeated} />
            <KpiCard label="Recovered anomalies" value={dashboard.weightAnomalies.recovered} />
          </div>
          {dashboard.empty.weightAnomalies ? (
            <p className="empty-state">{EMPTY_COPY.weightAnomalies}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Weighbridge</th>
                    <th>Type</th>
                    <th>Observed</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.weightAnomalies.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.weighbridge.code}</td>
                      <td>{anomalyTypeLabel(item.type)}</td>
                      <td>{item.observedWeightKg ?? "—"} kg</td>
                      <td>{item.severity}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <Link to={`/weighbridge/anomalies/${item.id}`} className="text-link">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p>
            <Link to="/weighbridge/anomalies" className="text-link">
              Anomaly history
            </Link>
          </p>
        </section>
      ) : null}

      {dashboard && sections.includes("alerts") ? (
        <section className="dashboard-panel">
          <h2>Operational alerts</h2>
          {dashboard.empty.alerts ? (
            <p className="empty-state">{EMPTY_COPY.alerts}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Alert</th>
                    <th>Transaction</th>
                    <th>Vehicle</th>
                    <th>Site</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.alerts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className={`severity-dot severity-${item.severity.toLowerCase()}`} />
                        {item.severity}
                      </td>
                      <td>{item.title}</td>
                      <td>{item.referenceNumber ?? "—"}</td>
                      <td>{item.vehicleNumber ?? "—"}</td>
                      <td>{item.site.name}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <Link to={item.href} className="text-link">
                          Open
                        </Link>
                        {canManageAlerts(user) && item.status === "OPEN" ? (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              void acknowledgeAlert(item.id).then(() => setRefreshToken((current) => current + 1))
                            }
                          >
                            Acknowledge
                          </button>
                        ) : null}
                        {canManageAlerts(user) && item.status !== "RESOLVED" ? (
                          <button
                            type="button"
                            className="text-link"
                            onClick={() =>
                              void resolveAlert(item.id).then(() => setRefreshToken((current) => current + 1))
                            }
                          >
                            Resolve
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dashboard && sections.includes("exceptions") ? (
        <section className="dashboard-panel">
          <h2>Exceptions</h2>
          {dashboard.empty.exceptions ? (
            <p className="empty-state">{EMPTY_COPY.exceptions}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Message</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.exceptions.map((item) => (
                    <tr key={item.id}>
                      <td>{item.referenceNumber}</td>
                      <td>{item.vehicleNumber ?? "—"}</td>
                      <td>{item.exceptionType.replaceAll("_", " ")}</td>
                      <td>{item.message}</td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>
                        <Link to={`/transactions/${item.id}`} className="text-link">
                          View details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dashboard && sections.includes("audit") ? (
        <section className="dashboard-panel">
          <h2>Recent audit activity</h2>
          {dashboard.empty.audit ? (
            <p className="empty-state">{EMPTY_COPY.audit}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Timestamp</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.audit.map((item) => (
                    <tr key={item.id}>
                      <td>{item.user}</td>
                      <td>{item.action.replaceAll("_", " ")}</td>
                      <td>
                        {item.entityType}
                        {item.entityType === "Transaction" ? (
                          <>
                            {" "}
                            <Link to={`/transactions/${item.entityId}`} className="text-link">
                              open
                            </Link>
                          </>
                        ) : null}
                      </td>
                      <td>{formatDateTime(item.occurredAt)}</td>
                      <td>{item.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function canManageAlerts(user: { roles: Array<{ code: string }>; permissions: string[] } | null): boolean {
  if (!user) {
    return false;
  }
  return (
    user.roles.some((role) => role.code === "ADMIN" || role.code === "SUPERVISOR") ||
    user.permissions.includes("report.read")
  );
}

function KpiCard({
  label,
  value,
  hint,
  empty,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  empty?: boolean;
  tone?: "default" | "alert";
}) {
  return (
    <article className={`kpi-card ${tone === "alert" ? "kpi-alert" : ""}`}>
      <span>{label}</span>
      <strong>{empty ? "—" : value}</strong>
      <em>{empty ? EMPTY_COPY.kpis : hint ?? "From live database records"}</em>
    </article>
  );
}

function DashboardTable({
  title,
  empty,
  rows,
  showStage = false,
  showCompleted = false,
}: {
  title: string;
  empty: string;
  rows: PublicDashboardTransaction[];
  showStage?: boolean;
  showCompleted?: boolean;
}) {
  return (
    <section className="dashboard-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? (
        <p className="empty-state">{empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Vehicle</th>
                <th>Material</th>
                <th>Workflow</th>
                <th>Gross</th>
                <th>Tare</th>
                <th>Net</th>
                <th>Status</th>
                {showStage ? <th>Responsible stage</th> : null}
                <th>Site</th>
                <th>Created</th>
                <th>{showCompleted ? "Completed" : "Updated"}</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.referenceNumber}</td>
                  <td>{item.vehicleNumber ?? "—"}</td>
                  <td>{item.material?.name ?? "—"}</td>
                  <td>{item.workflowCode ?? "—"}</td>
                  <td>{formatKg(item.grossWeightKg)}</td>
                  <td>{formatKg(item.tareWeightKg)}</td>
                  <td>{formatKg(item.netWeightKg)}</td>
                  <td>
                    <StatusPill value={item.status} />
                  </td>
                  {showStage ? <td>{item.responsibleStage}</td> : null}
                  <td>{item.site.name}</td>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>{showCompleted ? (item.completedAt ? formatDateTime(item.completedAt) : "—") : formatDateTime(item.updatedAt)}</td>
                  <td>
                    <Link to={`/transactions/${item.id}`} className="text-link">
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
