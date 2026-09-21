# Management dashboard and reporting foundation

**Status:** Step 10 foundation, extended in Step 26  
**Audience:** operators, office users, and developers  
**Related:** [architecture.md](./architecture.md), [reporting-analytics.md](./reporting-analytics.md), [report-catalog.md](./report-catalog.md)

The dashboard reads live PostgreSQL data through existing Prisma models. It does not store duplicate KPI rows, and it does not invent transaction events.

## Architecture

```text
apps/web/src/modules/dashboard
  DashboardPage.tsx     KPI + live/recent/approvals/unloading/exceptions/audit
  ReportsPage.tsx       Transaction, material, vehicle, exception reports
  api.ts                Typed /api/v1/dashboard and /api/v1/reports clients

apps/api/src/modules/dashboard
  routes.ts             Auth + RBAC
  service.ts            Aggregations, pagination, site scope
  filters.ts            Shared Prisma where clauses
  mapper.ts             Compact transaction rows + next-action stage
  validators.ts         Query validation and site-timezone dates
```

Data flow:

1. Browser sends the session cookie to `/api/v1/dashboard`.
2. `requirePermission("dashboard.read")` runs before any query.
3. `accessibleSiteWhere` limits rows to the caller’s organization and assigned sites.
4. “Today” and date-only filters (`YYYY-MM-DD`) use the selected or default site timezone (`Asia/Kolkata` in the demo). They are not treated as UTC midnight.
5. KPI counts, live lists, and reports are aggregated on the server.
6. The UI polls the dashboard every 15 seconds while the tab is visible, and also has a Refresh button. There is no WebSocket layer.

## API endpoints

All routes require authentication.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/dashboard` | `dashboard.read` | KPI summary + first page of operational lists |
| GET | `/api/v1/dashboard/lookups` | `dashboard.read` | Sites, weighbridges, materials, workflows, statuses |
| GET | `/api/v1/dashboard/live` | `dashboard.read` | Paginated in-progress transactions |
| GET | `/api/v1/dashboard/recent` | `dashboard.read` | Paginated recent transactions |
| GET | `/api/v1/dashboard/approvals` | `dashboard.read` | Pending approvals the caller may monitor |
| GET | `/api/v1/dashboard/unloading` | `dashboard.read` | Pending unloading |
| GET | `/api/v1/dashboard/exceptions` | `dashboard.read` | Operational exceptions |
| GET | `/api/v1/dashboard/charts` | `dashboard.read` + report capability | Chart series |
| GET | `/api/v1/dashboard/audit` | `audit.read` | Recent audit rows (no IP / user-agent) |
| GET | `/api/v1/reports/lookups` | `report.read` | Report filter catalogs |
| GET | `/api/v1/reports/catalog` | `report.read` | Report definitions |
| GET | `/api/v1/reports/transactions` | `report.read` | Paginated transaction report |
| GET | `/api/v1/reports/weighments` | `report.read` | Paginated weighment report |
| GET | `/api/v1/reports/materials` | `report.read` | Material totals |
| GET | `/api/v1/reports/vehicles` | `report.read` | Vehicle activity |
| GET | `/api/v1/reports/suppliers` | `report.read` | Supplier totals (existing suppliers only) |
| GET | `/api/v1/reports/weighbridges` | `report.read` | Weighbridge factual metrics |
| GET | `/api/v1/reports/workflow` | `report.read` | Stage durations |
| GET | `/api/v1/reports/approvals` | `report.read` | Approval counts |
| GET | `/api/v1/reports/exceptions` | `report.read` | Exception details |
| GET | `/api/v1/reports/anomalies` | `report.read` | Weight anomaly report |
| GET | `/api/v1/reports/sync` | `report.read` | Offline / synchronization |
| GET | `/api/v1/reports/daily` | `report.read` | Daily operations summary |
| GET | `/api/v1/reports/:id/export` | `report.read` | CSV export (same filters/RBAC) |

Common query parameters: `from`, `to`, `siteId`, `weighbridgeId`, `status`, `vehicle` (or `q`), `materialId`, `workflowCode`, `page`, `pageSize` (max 50).

## Report queries

- **Transactions:** filtered `Transaction` list with weighments, workflow snapshot, and next-action stage.
- **Materials:** `groupBy materialId` plus GROSS/TARE weighment sums. Net totals use the stored `netWeightKg` snapshot.
- **Vehicles:** `groupBy vehicleId` with count, net sum, and last `arrivedAt`.
- **Exceptions:** existing `EXCEPTION`, `REJECTED`, `ON_HOLD`, and rejected-document rows, classified in the API. A weight mismatch is an operational exception, not a fraud finding.
- **Charts:** status counts, material counts, daily volume in the site timezone, completed net weight by material.

## RBAC

| Role | Dashboard | Reports | Notes |
| --- | --- | --- | --- |
| ADMIN | Full | Full | Organization-wide sites |
| OFFICE_MANAGER | Full | Full | Site-scoped in the demo seed |
| SUPERVISOR | Full | Full | Site-scoped |
| WEIGHBRIDGE_OPERATOR | Operational | No | Live jobs, recent, exceptions, unloading |
| STORE_OFFICER | Store-focused | No | Pending approvals for Store |
| SITE_USER / PLANT_USER | Site/unloading | No | Assigned sites only |
| LAB_USER | Operational | No | Approvals if `approval.decide` |
| DRIVER | No | No | `transaction.read` only |

Frontend links are hidden by permission. The API still returns 403 when the cookie lacks the permission.

Site isolation is enforced with the existing `assertSiteAccess` / `accessibleSiteWhere` helpers. `office@demo.local` cannot read Demo Site B. `admin@demo.local` can. `site-b@demo.local` only sees Site B.

## How to run locally

```bash
pnpm install
pnpm db:generate
pnpm --filter @trinetra/api db:migrate:deploy
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

Open http://localhost:5173, sign in, then use **Dashboard** and **Reports**.

### Demo credentials

Development-only, password `demo-password`:

- `office@demo.local` — management dashboard and reports
- `admin@demo.local` — all sites
- `weighbridge@demo.local` — operational dashboard, no reports
- `store@demo.local` — store pending approvals
- `site-b@demo.local` — Site B only (`TRN-DEMO-DASH-SITEB`)

Seed dashboard references (created once, never overwritten on later seeds):

- `TRN-DEMO-DASH-ACTIVE` — identified / live
- `TRN-DEMO-DASH-APPROVAL` — pending supervisor approval
- `TRN-DEMO-DASH-UNLOAD` — approved, assigned unloading
- `TRN-DEMO-DASH-EXCEPTION` — tare greater than gross
- `TRN-DEMO-DASH-DONE` — completed with net weight
- `TRN-DEMO-DASH-SITEB` — Site B arrival for isolation checks

These are development demo rows, not production statistics.

## Known limitations

- Refresh is polling, not WebSockets.
- Exception classification is derived from existing fields. There is no fraud engine.
- Material/vehicle report weight totals for very large histories are computed from matching weighment rows, not a warehouse cube.
- In-app notifications and operational alerts are documented in [notifications.md](./notifications.md).
- Correction apply, email/SMS/push, ERP, hardware, and predictive analytics are later steps.
- Office manager in the demo seed is assigned to Demo Site, so their “full” dashboard is still site-scoped.
