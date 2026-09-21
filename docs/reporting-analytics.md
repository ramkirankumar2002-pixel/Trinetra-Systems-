# Reporting, analytics, and business intelligence

**Status:** Step 26  
**Audience:** operators, office users, and developers  
**Related:** [dashboard.md](./dashboard.md), [report-catalog.md](./report-catalog.md)

This layer sits on the existing dashboard and report module. It does not introduce a second warehouse, ERP connector, or predictive model. Every figure is counted from PostgreSQL rows that already exist.

```text
PostgreSQL (Transaction, Weighment, Approval, WeightAnomalyEvent, EdgeSyncSnapshot, …)
        ↓
Dashboard / reporting service  (apps/api/src/modules/dashboard)
        ↓
Analytics APIs                 GET /api/v1/reports/*
        ↓
Dashboard charts + Reports UI  (apps/web/src/modules/dashboard)
```

Reports **read**. They never update transaction weights, approvals, or hardware state.

## Permissions

| Action | Permission | Enforcement |
| --- | --- | --- |
| Open Reports, call analytics APIs, export CSV | `report.read` | `requirePermission` + `assertReports` |
| Site-restricted roles | assigned `siteId`s | `assertSiteAccess` / `accessibleSiteWhere` on the server |
| Audit of generate/export | existing `AuditLog` | metadata only (report id, dates, site, row count) |

Frontend hiding is not authorization. Changing `siteId` in the query string cannot bypass site scope.

## Date and time

- Date-only filters (`YYYY-MM-DD`) and presets use the selected or default **site timezone** (`Asia/Kolkata` in the demo).
- Presets: Today, Yesterday, Last 7 days, Last 30 days, Current month, Custom.
- UTC midnight is not treated as the operational day.

## Net weight

Material, vehicle, supplier, daily, and weighbridge totals use `Transaction.netWeightKg` — the snapshot written by the transaction engine. Reports do not re-run gross−tare. If no stored net exists for the matching rows, the cell is `Insufficient data`, not a fabricated zero.

## Insufficient data vs empty

| Situation | UI / API |
| --- | --- |
| No matching rows | `No data available for the selected period.` (`meta.empty`) |
| A duration cannot be computed because a timestamp is missing | `Insufficient data` |
| Weighment stability (quality is not stored on `Weighment`) | `Insufficient data` |

Zeros are not shown as activity when `meta.empty` is true.

## Performance

- List reports paginate (`pageSize` max 50).
- CSV export is capped at 2,000 rows and uses the same filters and RBAC as the JSON report.
- Aggregations use Prisma `groupBy` / `aggregate` and SQL `GROUP BY` (daily volume, material gross/tare, stage durations). Reports do not load the full history into JavaScript to sum it.
- Existing indexes (`organizationId, siteId, arrivedAt`, weighbridge, material, vehicle, approvals, anomalies) are reused. No extra indexes were added in this step.

## Export and audit

`GET /api/v1/reports/:reportId/export` returns CSV JSON `{ filename, csv }`.

Audit actions (no report body stored):

- `REPORT_GENERATED`
- `REPORT_EXPORTED`
- `LARGE_REPORT_REQUESTED` (no dates, or span over 90 days)

## Out of scope for this step

- Customer-only reporting portal
- Scheduled email / WhatsApp delivery
- PDF (no existing PDF pipeline)
- Employee rankings or performance scores
- Claimed cost/time savings
- Confirmed-fraud labels on weight anomalies
- ERP integration and predictive analytics

Scheduled delivery remains a future extension point only; no mailer was added.
