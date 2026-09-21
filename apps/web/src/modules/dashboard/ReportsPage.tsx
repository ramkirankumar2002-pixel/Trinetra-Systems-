import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiError } from "../../shared/api/client.ts";
import { formatDateTime, formatKg, StatusPill } from "../../shared/ui/StatusPill.tsx";
import {
  downloadReportCsv,
  getAnomalyReport,
  getApprovalReport,
  getDailyReport,
  getDashboardCharts,
  getExceptionReport,
  getMaterialReport,
  getReportLookups,
  getSupplierReport,
  getSyncReport,
  getTransactionReport,
  getVehicleReport,
  getWeighbridgeReport,
  getWeighmentReport,
  getWorkflowReport,
  type AnomalyReportRow,
  type ApprovalAnalytics,
  type ChartPayload,
  type DailyOperationsReport,
  type DashboardLookups,
  type ExceptionDetailRow,
  type ExceptionReportRow,
  type MaterialReportRow,
  type PublicDashboardTransaction,
  type ReportMeta,
  type SupplierReportRow,
  type SyncReportRow,
  type VehicleReportRow,
  type WeighbridgeReportRow,
  type WeighmentReportRow,
  type WorkflowReportRow,
} from "./api.ts";
import { buildDashboardSearch, EMPTY_COPY, presetToRange } from "./dashboardSections.ts";
import { SimpleBarChart } from "./SimpleBarChart.tsx";
import { useDebouncedValue } from "./useDebouncedValue.ts";

type ReportTab =
  | "transactions"
  | "weighments"
  | "materials"
  | "vehicles"
  | "suppliers"
  | "weighbridges"
  | "workflow"
  | "approvals"
  | "exceptions"
  | "anomalies"
  | "sync"
  | "daily";

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "transactions", label: "Transactions" },
  { id: "weighments", label: "Weighments" },
  { id: "materials", label: "Materials" },
  { id: "vehicles", label: "Vehicles" },
  { id: "suppliers", label: "Suppliers" },
  { id: "weighbridges", label: "Weighbridges" },
  { id: "workflow", label: "Workflow" },
  { id: "approvals", label: "Approvals" },
  { id: "exceptions", label: "Exceptions" },
  { id: "anomalies", label: "Weight anomalies" },
  { id: "sync", label: "Offline / sync" },
  { id: "daily", label: "Daily operations" },
];

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "current_month", label: "Current month" },
  { id: "custom", label: "Custom" },
];

export function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("transactions");
  const [vehicleInput, setVehicleInput] = useState("");
  const vehicle = useDebouncedValue(vehicleInput, 400);
  const [datePreset, setDatePreset] = useState("last_30_days");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [weighbridgeId, setWeighbridgeId] = useState("");
  const [status, setStatus] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [workflowCode, setWorkflowCode] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [exceptionFamily, setExceptionFamily] = useState("");
  const [source, setSource] = useState("");
  const [kind, setKind] = useState("");
  const [stability, setStability] = useState("");
  const [page, setPage] = useState(1);
  const [filterKey, setFilterKey] = useState("");
  const [lookups, setLookups] = useState<DashboardLookups | null>(null);
  const [charts, setCharts] = useState<ChartPayload | null>(null);
  const [transactions, setTransactions] = useState<PublicDashboardTransaction[]>([]);
  const [weighments, setWeighments] = useState<WeighmentReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [materials, setMaterials] = useState<MaterialReportRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleReportRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierReportRow[]>([]);
  const [weighbridges, setWeighbridgeRows] = useState<WeighbridgeReportRow[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowReportRow[]>([]);
  const [approvals, setApprovals] = useState<ApprovalAnalytics | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionDetailRow[]>([]);
  const [exceptionSummary, setExceptionSummary] = useState<ExceptionReportRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyReportRow[]>([]);
  const [syncRows, setSyncRows] = useState<SyncReportRow[]>([]);
  const [daily, setDaily] = useState<DailyOperationsReport | null>(null);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const timeZone = lookups?.timezone ?? "Asia/Kolkata";
  const nextFilterKey = [
    datePreset,
    from,
    to,
    siteId,
    weighbridgeId,
    status,
    vehicle,
    materialId,
    workflowCode,
    supplierId,
    exceptionFamily,
    source,
    kind,
    stability,
    tab,
  ].join("|");
  if (filterKey !== nextFilterKey) {
    setFilterKey(nextFilterKey);
    setPage(1);
  }
  const activePage = filterKey === nextFilterKey ? page : 1;
  const search = buildDashboardSearch({
    from,
    to,
    siteId,
    weighbridgeId,
    status,
    vehicle,
    materialId,
    workflowCode,
    page: String(activePage),
    pageSize: "20",
    datePreset,
    supplierId,
    exceptionFamily,
    source,
    kind,
    stability,
  });
  const searchKey = search.toString();

  useEffect(() => {
    void getReportLookups()
      .then((result) => {
        setLookups(result);
        if (datePreset !== "custom" && from === "" && to === "") {
          const range = presetToRange(datePreset, result.timezone ?? "Asia/Kolkata");
          setFrom(range.from);
          setTo(range.to);
        }
      })
      .catch((caught: unknown) => {
        setError(isApiError(caught) ? caught.message : "Unable to load report filters");
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async (): Promise<void> => {
      const chartResult = await getDashboardCharts(search);
      if (!cancelled) {
        setCharts(chartResult.charts);
      }

      if (tab === "transactions") {
        const result = await getTransactionReport(search);
        if (!cancelled) {
          setTransactions(result.items);
          setTotal(result.total);
          setPageSize(result.pageSize);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "weighments") {
        const result = await getWeighmentReport(search);
        if (!cancelled) {
          setWeighments(result.items);
          setTotal(result.total);
          setPageSize(result.pageSize);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "materials") {
        const result = await getMaterialReport(search);
        if (!cancelled) {
          setMaterials(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "vehicles") {
        const result = await getVehicleReport(search);
        if (!cancelled) {
          setVehicles(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "suppliers") {
        const result = await getSupplierReport(search);
        if (!cancelled) {
          setSuppliers(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "weighbridges") {
        const result = await getWeighbridgeReport(search);
        if (!cancelled) {
          setWeighbridgeRows(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "workflow") {
        const result = await getWorkflowReport(search);
        if (!cancelled) {
          setWorkflow(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "approvals") {
        const result = await getApprovalReport(search);
        if (!cancelled) {
          setApprovals(result);
          setMeta(result.meta);
        }
        return;
      }
      if (tab === "exceptions") {
        const result = await getExceptionReport(search);
        if (!cancelled) {
          setExceptions(result.items);
          setExceptionSummary(result.summary ?? []);
          setTotal(result.total ?? result.items.length);
          setPageSize(result.pageSize ?? 20);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "anomalies") {
        const result = await getAnomalyReport(search);
        if (!cancelled) {
          setAnomalies(result.items);
          setTotal(result.total);
          setPageSize(result.pageSize);
          setMeta(result.meta ?? null);
        }
        return;
      }
      if (tab === "sync") {
        const result = await getSyncReport(search);
        if (!cancelled) {
          setSyncRows(result.items);
          setMeta(result.meta ?? null);
        }
        return;
      }
      const result = await getDailyReport(search);
      if (!cancelled) {
        setDaily(result);
        setMeta(result.meta);
      }
    };

    void load()
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(isApiError(caught) ? caught.message : "Unable to load report");
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
  }, [searchKey, tab]);

  const siteWeighbridges = (lookups?.weighbridges ?? []).filter((item) => siteId === "" || item.siteId === siteId);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const emptyMessage = meta?.emptyMessage ?? EMPTY_COPY.period;

  function applyPreset(preset: string) {
    setDatePreset(preset);
    if (preset === "custom") {
      return;
    }
    const range = presetToRange(preset, timeZone);
    setFrom(range.from);
    setTo(range.to);
  }

  return (
    <main className="page-shell dashboard-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Reporting and analytics</p>
          <h1>Reports</h1>
          <p className="login-note">
            Figures are calculated from stored records in {meta?.timezone ?? timeZone}. Net weight uses the
            transaction snapshot. Missing timestamps are shown as Insufficient data, never estimated.
          </p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="ghost-button" onClick={() => void downloadReportCsv(tab, search)}>
            Export CSV
          </button>
          <Link to="/dashboard" className="ghost-button">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="report-presets" role="group" aria-label="Date range">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={datePreset === preset.id ? "tab-active" : "ghost-button"}
            onClick={() => applyPreset(preset.id)}
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
            {siteWeighbridges.map((item) => (
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
          Supplier
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">All suppliers</option>
            {(lookups?.suppliers ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exception
          <select value={exceptionFamily} onChange={(event) => setExceptionFamily(event.target.value)}>
            <option value="">All exception families</option>
            {(lookups?.exceptionFamilies ?? []).map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weighment source
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All sources</option>
            {(lookups?.weighmentSources ?? []).map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weighment type
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All types</option>
            {["GROSS", "TARE", "OTHER"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stability
          <select value={stability} onChange={(event) => setStability(event.target.value)}>
            <option value="">All (quality not stored)</option>
            <option value="STABLE">Stable</option>
            <option value="UNSTABLE">Unstable</option>
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

      <div className="report-tabs" role="tablist">
        {TABS.map((item) => (
          <TabButton key={item.id} current={tab} id={item.id} onSelect={setTab} label={item.label} />
        ))}
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="session-status">Loading report…</p> : null}

      <section className="chart-grid">
        <SimpleBarChart title="Transactions by day" rows={charts?.dailyVolume ?? []} />
        <SimpleBarChart title="Net weight by day" rows={charts?.netWeightByDay ?? []} formatValue={(value) => formatKg(String(value))} />
        <SimpleBarChart title="Transactions by material" rows={charts?.byMaterial ?? []} />
        <SimpleBarChart title="Transactions by site" rows={charts?.bySite ?? []} />
        <SimpleBarChart title="Workflow status" rows={charts?.byStatus ?? []} />
        <SimpleBarChart title="Exceptions" rows={charts?.exceptionCount ?? []} />
        <SimpleBarChart title="Approval status" rows={charts?.approvalStatus ?? []} />
        <SimpleBarChart title="Gateway status" rows={charts?.gatewayStatus ?? []} />
      </section>

      {tab === "transactions" ? (
        <section className="dashboard-panel">
          <h2>Transaction report</h2>
          {transactions.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Vehicle</th>
                    <th>Material</th>
                    <th>Supplier</th>
                    <th>Gross</th>
                    <th>Tare</th>
                    <th>Net</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Completed</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/transactions/${item.id}`} className="text-link">
                          {item.referenceNumber}
                        </Link>
                      </td>
                      <td>{item.vehicleNumber ?? "—"}</td>
                      <td>{item.material?.name ?? "—"}</td>
                      <td>{item.supplier?.name ?? "—"}</td>
                      <td>{formatKg(item.grossWeightKg)}</td>
                      <td>{formatKg(item.tareWeightKg)}</td>
                      <td>{formatKg(item.netWeightKg)}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>{formatDateTime(item.createdAt)}</td>
                      <td>{item.completedAt ? formatDateTime(item.completedAt) : "—"}</td>
                      <td>{item.durationLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager activePage={activePage} pageCount={pageCount} total={total} onPage={setPage} />
        </section>
      ) : null}

      {tab === "weighments" ? (
        <section className="dashboard-panel">
          <h2>Weighment report</h2>
          {weighments.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Vehicle</th>
                    <th>Weighbridge</th>
                    <th>Type</th>
                    <th>Weight</th>
                    <th>Unit</th>
                    <th>Stability</th>
                    <th>Source</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {weighments.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/transactions/${item.transactionId}`} className="text-link">
                          {item.transaction}
                        </Link>
                      </td>
                      <td>{item.vehicleNumber ?? "—"}</td>
                      <td>{item.weighbridge?.code ?? "—"}</td>
                      <td>{item.kind}</td>
                      <td>{formatKg(item.weightKg)}</td>
                      <td>{item.unit}</td>
                      <td>{item.stability}</td>
                      <td>{item.source}</td>
                      <td>{formatDateTime(item.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager activePage={activePage} pageCount={pageCount} total={total} onPage={setPage} />
        </section>
      ) : null}

      {tab === "materials" ? (
        <section className="dashboard-panel">
          <h2>Material report</h2>
          {materials.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Transactions</th>
                    <th>Total gross</th>
                    <th>Total tare</th>
                    <th>Total net</th>
                    <th>Configured workflow</th>
                    <th>Workflow in period</th>
                    <th>Site</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((item) => (
                    <tr key={item.materialId ?? "none"}>
                      <td>{item.material}</td>
                      <td>{item.transactionCount}</td>
                      <td>{formatKg(item.totalGrossWeightKg)}</td>
                      <td>{formatKg(item.totalTareWeightKg)}</td>
                      <td>{formatKg(item.totalNetWeightKg)}</td>
                      <td>{item.configuredWorkflow ?? "—"}</td>
                      <td>{item.workflowClassification ?? "—"}</td>
                      <td>{item.site ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "vehicles" ? (
        <section className="dashboard-panel">
          <h2>Vehicle report</h2>
          {vehicles.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Transactions</th>
                    <th>Total material handled</th>
                    <th>Total net</th>
                    <th>First transaction</th>
                    <th>Last transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((item) => (
                    <tr key={item.vehicleId ?? "none"}>
                      <td>{item.vehicleNumber}</td>
                      <td>{item.transactionCount}</td>
                      <td>{formatKg(item.totalMaterialHandledKg ?? item.totalNetWeightKg)}</td>
                      <td>{formatKg(item.totalNetWeightKg)}</td>
                      <td>{item.firstTransactionAt ? formatDateTime(item.firstTransactionAt) : "—"}</td>
                      <td>{item.lastTransactionAt ? formatDateTime(item.lastTransactionAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "suppliers" ? (
        <section className="dashboard-panel">
          <h2>Supplier report</h2>
          {suppliers.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Transactions</th>
                    <th>Total net</th>
                    <th>Materials</th>
                    <th>Date range</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((item) => (
                    <tr key={item.supplierId ?? "none"}>
                      <td>{item.supplier}</td>
                      <td>{item.transactionCount}</td>
                      <td>{formatKg(item.totalNetWeightKg)}</td>
                      <td>{item.materials.join(", ") || "—"}</td>
                      <td>
                        {item.from ?? "—"} → {item.to ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "weighbridges" ? (
        <section className="dashboard-panel">
          <h2>Weighbridge performance</h2>
          <p className="login-note">Factual counts only. These figures do not rank weighbridges as better or worse.</p>
          {weighbridges.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Weighbridge</th>
                    <th>Processed</th>
                    <th>Completed</th>
                    <th>Exceptions</th>
                    <th>Weight anomalies</th>
                    <th>Avg transaction</th>
                    <th>Avg weighment</th>
                    <th>Offline snapshots</th>
                    <th>Device failures</th>
                  </tr>
                </thead>
                <tbody>
                  {weighbridges.map((item) => (
                    <tr key={item.weighbridgeId ?? "none"}>
                      <td>
                        {item.weighbridge} {item.isActive ? "" : "(inactive)"}
                      </td>
                      <td>{item.transactionsProcessed}</td>
                      <td>{item.completedTransactions}</td>
                      <td>{item.exceptions}</td>
                      <td>{item.weightAnomalies}</td>
                      <td>{item.averageTransactionDuration.label}</td>
                      <td>{item.averageWeighmentDuration.label}</td>
                      <td>{item.offlineGatewaySnapshots}</td>
                      <td>{item.deviceCommunicationFailures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "workflow" ? (
        <section className="dashboard-panel">
          <h2>Workflow performance</h2>
          {workflow.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Samples with timestamps</th>
                    <th>Average duration</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {workflow.map((item) => (
                    <tr key={item.stage}>
                      <td>{item.stage}</td>
                      <td>{item.sampleCount}</td>
                      <td>{item.averageDuration}</td>
                      <td>{item.data === "actual" ? "Actual" : "Insufficient data"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "approvals" ? (
        <section className="dashboard-panel">
          <h2>Approval analytics</h2>
          {approvals?.meta.empty && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : approvals ? (
            <>
              <div className="kpi-grid">
                <article className="kpi-card">
                  <span>Pending</span>
                  <strong>{approvals.pending}</strong>
                </article>
                <article className="kpi-card">
                  <span>Approved</span>
                  <strong>{approvals.approved}</strong>
                </article>
                <article className="kpi-card">
                  <span>Rejected</span>
                  <strong>{approvals.rejected}</strong>
                </article>
                <article className="kpi-card">
                  <span>Average approval time</span>
                  <strong>{approvals.averageApprovalTime.label}</strong>
                </article>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.byDepartment.map((item) => (
                      <tr key={item.department}>
                        <td>{item.department}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "exceptions" ? (
        <section className="dashboard-panel">
          <h2>Exception report</h2>
          {exceptions.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <>
              {exceptionSummary.length > 0 ? (
                <p className="login-note">
                  {exceptionSummary.map((item) => `${item.exceptionType.replaceAll("_", " ")}: ${item.count}`).join(" · ")}
                </p>
              ) : null}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Exception type</th>
                      <th>Transaction</th>
                      <th>Site</th>
                      <th>Weighbridge</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Resolution time</th>
                      <th>Resolution status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptions.map((item, index) => (
                      <tr key={`${item.transactionId ?? "none"}-${index}`}>
                        <td>{item.exceptionType.replaceAll("_", " ")}</td>
                        <td>
                          {item.transactionId ? (
                            <Link to={`/transactions/${item.transactionId}`} className="text-link">
                              {item.transaction}
                            </Link>
                          ) : (
                            (item.transaction ?? "—")
                          )}
                        </td>
                        <td>{item.site}</td>
                        <td>{item.weighbridge ?? "—"}</td>
                        <td>{formatDateTime(item.createdAt)}</td>
                        <td>
                          <StatusPill value={item.status} />
                        </td>
                        <td>{item.resolutionTime}</td>
                        <td>{item.resolutionStatus.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager activePage={activePage} pageCount={pageCount} total={total} onPage={setPage} />
            </>
          )}
        </section>
      ) : null}

      {tab === "anomalies" ? (
        <section className="dashboard-panel">
          <h2>Weight anomaly report</h2>
          <p className="login-note">Possible weighing-system issues. These records are not confirmed fraud.</p>
          {anomalies.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Transaction / device</th>
                    <th>Weight context</th>
                    <th>Timestamp</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Resolution</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((item) => (
                    <tr key={item.id}>
                      <td>{item.label}: {item.type.replaceAll("_", " ")}</td>
                      <td>
                        {item.transactionId ? (
                          <Link to={`/transactions/${item.transactionId}`} className="text-link">
                            {item.transaction}
                          </Link>
                        ) : (
                          (item.deviceId ?? "—")
                        )}
                      </td>
                      <td>
                        {item.observedWeightKg ? formatKg(item.observedWeightKg) : "—"}
                        {item.previousWeightKg ? ` / prev ${formatKg(item.previousWeightKg)}` : ""}
                      </td>
                      <td>{formatDateTime(item.timestamp)}</td>
                      <td>{item.severity}</td>
                      <td>
                        <StatusPill value={item.status} />
                      </td>
                      <td>{item.resolution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager activePage={activePage} pageCount={pageCount} total={total} onPage={setPage} />
        </section>
      ) : null}

      {tab === "sync" ? (
        <section className="dashboard-panel">
          <h2>Offline / synchronization report</h2>
          {syncRows.length === 0 && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gateway</th>
                    <th>State</th>
                    <th>Queued</th>
                    <th>Generated</th>
                    <th>Synchronized</th>
                    <th>Failed</th>
                    <th>Dead letter</th>
                    <th>Offline duration</th>
                    <th>Last successful sync</th>
                  </tr>
                </thead>
                <tbody>
                  {syncRows.map((item) => (
                    <tr key={item.gatewayId}>
                      <td>{item.gateway}</td>
                      <td>{item.connectivityState}</td>
                      <td>{item.queued}</td>
                      <td>{item.eventsGenerated}</td>
                      <td>{item.eventsSynchronized}</td>
                      <td>{item.failedEvents}</td>
                      <td>{item.deadLetterEvents}</td>
                      <td>{item.offlineDuration.label}</td>
                      <td>{item.lastSuccessfulSyncAt ? formatDateTime(item.lastSuccessfulSyncAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "daily" ? (
        <section className="dashboard-panel">
          <h2>Daily operations</h2>
          {daily?.meta.empty && !loading ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : daily ? (
            <div className="kpi-grid">
              <article className="kpi-card">
                <span>Vehicles processed</span>
                <strong>{daily.vehiclesProcessed ?? "—"}</strong>
                <em>{daily.date}</em>
              </article>
              <article className="kpi-card">
                <span>Transactions</span>
                <strong>{daily.totalTransactions ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Completed</span>
                <strong>{daily.completed ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Pending</span>
                <strong>{daily.pending ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Exceptions</span>
                <strong>{daily.exceptions ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Total net material</span>
                <strong>{daily.totalNetWeightKg ? formatKg(daily.totalNetWeightKg) : "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Approvals</span>
                <strong>{daily.approvals ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Weight anomalies</span>
                <strong>{daily.weightAnomalies ?? "—"}</strong>
              </article>
              <article className="kpi-card">
                <span>Offline events</span>
                <strong>{daily.offlineEvents ?? "—"}</strong>
              </article>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function TabButton({
  current,
  id,
  label,
  onSelect,
}: {
  current: ReportTab;
  id: ReportTab;
  label: string;
  onSelect: (tab: ReportTab) => void;
}) {
  return (
    <button type="button" role="tab" aria-selected={current === id} className={current === id ? "tab-active" : "ghost-button"} onClick={() => onSelect(id)}>
      {label}
    </button>
  );
}

function Pager({
  activePage,
  pageCount,
  total,
  onPage,
}: {
  activePage: number;
  pageCount: number;
  total: number;
  onPage: (updater: (current: number) => number) => void;
}) {
  return (
    <div className="pager">
      <button type="button" className="ghost-button" disabled={activePage <= 1} onClick={() => onPage((current) => current - 1)}>
        Previous
      </button>
      <span>
        Page {activePage} of {pageCount} · {total} records
      </span>
      <button type="button" className="ghost-button" disabled={activePage >= pageCount} onClick={() => onPage((current) => current + 1)}>
        Next
      </button>
    </div>
  );
}
