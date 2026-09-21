# Report catalog

**Status:** Step 26  
**Related:** [reporting-analytics.md](./reporting-analytics.md)

All of these reports require `report.read`. Organization is always the caller’s organization. Site filters are intersected with the caller’s accessible sites on the server.

Net weight source for every total: stored `Transaction.netWeightKg`.

Empty payload message: `No data available for the selected period.`

| ID | Name | Filters | Columns / metrics | Aggregation | CSV | Pagination |
| --- | --- | --- | --- | --- | --- | --- |
| `transactions` | Transaction report | date, site, weighbridge, vehicle, material, supplier, status, workflow, exception family | id, vehicle, material, supplier, gross, tare, net, status, created, completed, duration | count | yes | yes |
| `weighments` | Weighment report | date, site, weighbridge, vehicle, source, kind, stability | transaction, vehicle, weighbridge, type, weight, unit (KG), stability, source, timestamp | count | yes | yes |
| `materials` | Material report | date, site, weighbridge, material, workflow | material, tx count, gross/tare/net totals, configured workflow, workflow in period, site | groupBy material | yes | no |
| `vehicles` | Vehicle report | date, site, weighbridge, vehicle, material | vehicle, tx count, material handled (stored net), first/last visit | groupBy vehicle | yes | no |
| `suppliers` | Supplier report | date, site, supplier, material | supplier, tx count, stored net, materials, date range | groupBy supplier (rows with `supplierId` only) | yes | no |
| `weighbridges` | Weighbridge performance | date, site, weighbridge | processed, completed, exceptions, weight anomalies, avg durations, offline snapshots, device failures | groupBy weighbridge | yes | no |
| `workflow` | Workflow performance | date, site, weighbridge, workflow | identification, document review, approval, unloading, final weighment, total duration | SQL averages when both timestamps exist | yes | no |
| `approvals` | Approval analytics | date, site, material, workflow | pending, approved, rejected, average time, counts by department and workflow step | groupBy decision | yes | no |
| `exceptions` | Exception report | date, site, weighbridge, family, status | family, transaction, site, weighbridge, created, status, resolution time/status | paginated details + status counts | yes | yes |
| `anomalies` | Weight anomaly report | date, site, weighbridge, status | type, transaction/device, weight context, time, severity, status, resolution | existing anomaly store | yes | yes |
| `sync` | Offline / sync report | date, site | gateway state, queued, generated, synced, failed, dead-letter, offline duration | snapshots + ingest + dead-letter + audit pairs | yes | no |
| `daily` | Daily operations | date (defaults to today), site, weighbridge | vehicles, transactions, completed, pending, exceptions, net weight, approvals, anomalies, offline events | counts for the selected site day | yes | no |

## Exception families

| Family | Source |
| --- | --- |
| `WEIGHT_EXCEPTION` | Transaction `EXCEPTION` / tare-exceeds-gross |
| `WORKFLOW_EXCEPTION` | On hold, rejected approval, other workflow blocks |
| `DOCUMENT_EXCEPTION` | Rejected or missing documents |
| `PROVIDER_EXCEPTION` | Operational alerts `SYSTEM_ALERT`, `GATEWAY_OFFLINE` |
| `SYNCHRONIZATION_EXCEPTION` | `EdgeSyncConflict` rows |

Weight anomalies are a **separate** report. They are labeled “Weight anomaly” / “Possible weighing-system issue”, never fraud.

## Workflow classification

Material rows show the **organization’s configured workflow** (`MaterialWorkflowAssignment`) and the workflow actually present on transactions in the period. Codes such as Type 1 / Type 2 / Type 3 are labels from that organization, not a global industry meaning.

## Weighment stability

Official `Weighment` rows do not currently store `WeightQuality`. The stability column is `Insufficient data`. Filtering by STABLE/UNSTABLE therefore returns no rows until quality is persisted.

## Known limitations

- CSV is limited to 2,000 rows. PDF is not offered.
- Daily charts fill calendar days in the site timezone; values are still counted from `arrivedAt`.
- Average stage duration ignores visits that lack the required timestamps.
- Weighbridge “offline snapshots” are current `EdgeSyncSnapshot` connectivity, not a reconstructed historical outage calendar (paired `EDGE_OFFLINE_ENTERED` / `EDGE_ONLINE_RESTORED` audits are used when both exist).
- No employee ranking, no savings claims, no customer-only portal, no scheduled email in this step.
