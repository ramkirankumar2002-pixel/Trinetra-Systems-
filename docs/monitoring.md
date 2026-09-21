# Monitoring

Operational monitoring for Trinetra Systems. This is application-level visibility for authorized administrators and managers. It is not a DevOps console, not predictive maintenance, and not a time-series database.

**Related:** [observability.md](./observability.md)

---

## Access control

| Role | Access |
| --- | --- |
| Driver | No monitoring dashboard |
| Weighbridge operator | Existing weighbridge / device / sync pages only |
| Supervisor / office manager | `monitoring.read` — operational monitoring dashboard |
| Administrator | Full monitoring (all permissions) |

APIs under `/api/v1/monitoring/*` require authentication and `monitoring.read`. Credentials, secrets, connection strings, and raw logs are not exposed.

Operators already see communication relevant to their work on the weighbridge dashboard. They do not receive infrastructure-wide metrics.

---

## APIs

All routes are authorized.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/monitoring/status` | Composed system status, issues, development simulators |
| GET | `/api/v1/monitoring/health` | Dependency health + safe migration probe |
| GET | `/api/v1/monitoring/gateways` | Gateway overlay status |
| GET | `/api/v1/monitoring/devices` | Communication state for registered devices |
| GET | `/api/v1/monitoring/sync` | Sync snapshots |
| GET | `/api/v1/monitoring/metrics` | Operational gauges + in-memory process metrics |
| GET | `/api/v1/monitoring/metrics?format=prometheus` | Text exposition extension point (not a Prometheus install) |
| GET | `/api/v1/monitoring/incidents` | Open/acknowledged operational incidents (paginated) |
| GET | `/api/v1/monitoring/history` | Paginated alert history including resolved |

Unlimited raw logs are not available over the API.

Public health endpoints remain:

- `GET /health` and `GET /health/live` — process up
- `GET /health/ready` — PostgreSQL only (unchanged contract)

---

## Logging

Structured JSON via `writeLog`:

- Timestamp, level (`DEBUG` `INFO` `WARN` `ERROR`), service, event
- Correlation / request ID
- User, transaction, gateway, or device IDs when known
- `errorCategory` on failures

`LOG_LEVEL` defaults to `info`. DEBUG is omitted unless configured.

**Not logged:** passwords, tokens, API keys, database credentials, document contents, request bodies, every live weight reading at INFO.

Slow HTTP requests (`SLOW_REQUEST_MS`, default 2000) and slow database operations (`SLOW_QUERY_MS`, default 500) emit WARN with duration and a SQL **verb** only (`SELECT` / `INSERT` / …). Raw SQL is not logged.

---

## Metrics

Abstraction: `InMemoryMetricsRegistry` (`apps/api/src/lib/metrics.ts`).

**In-memory metrics are not sufficient for production long-term historical monitoring.**

Tracked:

- System: API requests, errors, latency, active sessions, backend health
- Transactions: created, completed, in progress, exceptions, average processing time (bounded sample)
- Weighbridge: reading counters (not INFO logs), unstable, provider/reading failures
- Documents: uploaded, OCR requests/failures, awaiting review
- Approvals: pending / approved / rejected / average time
- Unloading: pending / active / completed / stale
- Offline: offline gateways, pending / failed / dead-letter sync events
- Security: open security events, weight anomalies, authn/authz failures

`GET /api/v1/monitoring/metrics?format=prometheus` is an extension point for a future scrape. Prometheus is not deployed here.

---

## Gateway, device, sync, and providers

Gateway **runtime** status remains `deriveGatewayRuntimeStatus` (`ONLINE` `PENDING` `OFFLINE` `DISABLED` `REVOKED`). Monitoring **overlays** `STALE` / `DEGRADED` / `ERROR` using existing heartbeat timeouts. Duplicate status machines were not added.

Devices show **Communication: ONLINE** (or OFFLINE / ERROR / …). Software connectivity is not claimed as physical health.

Sync status reuses `EdgeSyncSnapshot`. Dead-letter retry remains on the existing sync page with `sync.manage` and audit. Administrators cannot silently delete failed events from monitoring.

Providers: weighbridge, ANPR, OCR, and voice. Statuses: `AVAILABLE` `DEGRADED` `UNAVAILABLE` `SIMULATION` `DISABLED`. Simulation is labelled. Simulated hardware is not presented as live hardware.

---

## Alerts and incidents

Configurable thresholds (environment):

| Variable | Default | Use |
| --- | --- | --- |
| `GATEWAY_OFFLINE_TIMEOUT_MS` | 45000 | Gateway offline |
| `GATEWAY_STALE_AFTER_MS` | 20000 | Gateway stale overlay |
| `MONITORING_SYNC_QUEUE_WARN` | 100 | Documented for operators; queue size is visible on monitoring |
| `MONITORING_FAILED_SYNC_WARN` | 10 | Visible failed/dead-letter counts |
| `MONITORING_API_ERROR_RATE` | 0.2 | Windowed 5xx rate after minimum samples |
| `SLOW_REQUEST_MS` | 2000 | Slow API warning |
| `MONITORING_DB_LATENCY_MS` | 500 | Database probe warning |
| `STALE_*_HOURS` | existing | Stale transactions / unloading |

Alerts reuse `OperationalAlert` uniqueness on `eventKey` (typically day-bucketed). The same unresolved gateway-offline or system-degraded condition does not create a new alert every poll.

Incident titles include Gateway Offline, Database Unavailable, Synchronization Failure, Weight Provider Unavailable, ANPR Provider Unavailable, High API Error Rate. Weight anomalies are **not** labelled fraud.

When a dependency returns to AVAILABLE / SIMULATION, open `system.degraded:*` alerts are resolved.

---

## Frontend

Route: `/monitoring` (`monitoring.read`).

Refresh: 45 seconds by default. Override with `VITE_MONITORING_POLL_MS` (clamped 15s–120s; invalid values fall back to 45s). The operations dashboard poll was slowed from 15s to 30s because it also loads reliability status.

No WebSockets were added for visual effect.

---

## User-facing errors

Staff 5xx:

> Something went wrong. Please contact the administrator.  
> Reference ID: REQ-XXXXXXXX

Driver Mode continues to show a short driver-friendly message without the reference ID.

---

## Known limitations

- Metrics are in-process memory. Restarts lose history.
- Historical incidents are Operational Alerts, not a time-series store.
- Database migration probe reads `_prisma_migrations` when reachable and returns APPLIED or UNKNOWN. It does not auto-migrate.
- High-frequency live weight is counted, not logged at INFO.
- This is not production-grade observability until logs and metrics are shipped to an external system.

## Future production integrations

OpenTelemetry, Prometheus, Grafana, and centralized log management remain **future options**. They are not installed or configured in this step.
