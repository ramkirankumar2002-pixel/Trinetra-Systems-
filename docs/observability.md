# Observability architecture

Trinetra Systems is observable through existing application components. This is **not** a Prometheus, Grafana, or OpenTelemetry installation.

**Status:** Step 21 implemented for MVP/development visibility.  
**Related:** [monitoring.md](./monitoring.md), [backup-recovery.md](./backup-recovery.md), [security.md](./security.md), [edge-gateway.md](./edge-gateway.md), [offline-first.md](./offline-first.md)

---

## Information flow

```text
Frontend (React)
    ↓  HTTPS JSON + X-Request-Id / X-Correlation-Id
Backend (Express API)
    ↓  Prisma / structured logs / in-memory metrics
Database / in-process services
    ↓  heartbeat, ingest, sync acknowledgements
Edge Gateway
    ↓  protocol adapters (simulator by default)
Industrial devices (weighbridge, ANPR camera, scanner)
```

Operational information moves **up** that stack:

1. Devices report readings and communication to the Edge Gateway (or the in-process hardware simulator).
2. The gateway heartbeats and posts events to the API. The API stores snapshots, ingest results, and failures.
3. PostgreSQL holds transactions, alerts, sync queues, and audit rows. Health probes measure database reachability and latency without returning SQL or connection strings.
4. The API records structured logs and in-memory metrics, keyed by the existing request/correlation ID.
5. Authorized users read composed status on `/monitoring`. Critical conditions reuse Operational Alerts (`OPEN` → `ACKNOWLEDGED` → `RESOLVED`) and in-app notifications.

There are no WebSockets added for monitoring. The monitoring UI polls every 30–60 seconds (default 45s). Live weighment still polls at 1s because that is operational weighing, not the monitoring dashboard.

---

## What already existed (reused)

| Signal | Source |
| --- | --- |
| Logs | `writeLog` JSON lines with redaction |
| Health | `/health`, `/health/live`, `/health/ready` (PostgreSQL required for ready) |
| Gateway heartbeat | Edge Gateway + `deriveGatewayRuntimeStatus` |
| Sync queues | `EdgeSyncSnapshot` (queued / syncing / synced / failed / dead-letter) |
| Alerts | `OperationalAlert` unique `(organizationId, eventKey)` |
| Security events | `SecurityEvent` (separate from monitoring logs) |
| Audit | `AuditLog` (who did what) |
| Reliability | Backup/recovery dashboard and stale-transaction scan |

Step 21 **does not** replace those systems. It composes them and adds correlation aliases, DEBUG logs, in-memory metrics, and a monitoring dashboard.

---

## Correlation ID

The existing `X-Request-Id` **is** the correlation ID. Incoming `X-Correlation-Id` is accepted when it matches the same safe pattern. Responses set:

- `X-Request-Id`
- `X-Correlation-Id` (same value)
- `X-Reference-Id` (`REQ-` + 8 characters) for people to quote to an administrator

Logs use `requestId` and `correlationId` as the same identifier. Transaction IDs, gateway IDs, device IDs, and user IDs are attached where they already exist. A second unrelated ID system was not added.

Public 5xx responses include `referenceId` so staff can search logs. Driver Mode still shows a simple message without the reference.

---

## Separation of concerns

| Concept | Records |
| --- | --- |
| **Audit log** | Who performed an action |
| **Monitoring log** | What the system experienced (logs + metrics + health) |
| **Security event** | An operational/security condition requiring attention |
| **Operational alert** | Deduplicated open condition with lifecycle |

These remain separate tables and APIs.

---

## Production monitoring still required

In-memory metrics reset on process restart. They are **not** sufficient for production long-term historical monitoring.

Future integration possibilities (not installed in this step):

- OpenTelemetry traces/metrics exporters
- Prometheus scrape of the authenticated text exposition (`GET /api/v1/monitoring/metrics?format=prometheus`)
- Grafana dashboards
- Centralized log management (ELK, Loki, CloudWatch, and similar)

Do not treat this document as production-grade observability until those (or equivalent) are operated outside the application process.
