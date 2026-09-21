# Disaster recovery checklist

Use this with [backup-recovery.md](./backup-recovery.md) and [restore-procedure.md](./restore-procedure.md).

**IMPLEMENTED** items exist in the API, Edge queue, notifications, or health endpoints. **RECOMMENDED FOR PRODUCTION** items need hosting, UPS, or operator runbooks.

External monitoring of `/health/live` and `/health/ready` is recommended. Those endpoints never return passwords or connection strings.

---

## A. PostgreSQL unavailable

| | |
| --- | --- |
| Detection | `GET /health/ready` returns `unavailable`. API writes return 503. Optional `SIMULATE_DATABASE_UNAVAILABLE` (development only). |
| Immediate action | Keep Edge local queue running. Stop new central writes if the database is being repaired. |
| Recovery | Restore PostgreSQL or fail over. See restore procedure. |
| Validation | `/health/ready` is `ready` or `degraded`. Login succeeds. A known transaction still exists. |
| User impact | Web login and central recording stop. Driver/operator local capture can continue on Edge if the site PC is up. |
| Data loss | Unflushed PostgreSQL writes can be lost without WAL archive (**RECOMMENDED FOR PRODUCTION**). Edge events persisted locally are not acknowledged as stored until the local file write finishes (**IMPLEMENTED**). |

## B. Backend unavailable

| | |
| --- | --- |
| Detection | Process down; `/health/live` fails. Load balancer / operator check. |
| Immediate action | Restart the API. Do not reset the database. |
| Recovery | `tsx` / `node` start. Hardware, camera, and reliability scanners start from `index.ts`. |
| Validation | `/health/live` ok. Existing transactions unchanged. |
| User impact | Browser API calls fail until restart. Edge queues events. |
| Data loss | In-flight HTTP requests that did not commit are lost. Committed rows remain. |

## C. Frontend unavailable

| | |
| --- | --- |
| Detection | Vite / static host down. API may still be healthy. |
| Immediate action | Restart the web app. API and Edge do not need a restore. |
| Recovery | Serve `apps/web` again. Sessions are cookie JWTs against the API. |
| Validation | Login and dashboard load. |
| User impact | UI unavailable. Hardware capture on Edge can continue. |
| Data loss | None in PostgreSQL. Unsaved browser form input is lost. |

## D. Edge Gateway offline

| | |
| --- | --- |
| Detection | Heartbeat older than `GATEWAY_STALE_AFTER_MS` / `GATEWAY_OFFLINE_TIMEOUT_MS`. Scanner emits `GATEWAY_OFFLINE` (deduped per day). |
| Immediate action | Check site power, LAN, and Edge process. Do not delete the local queue. |
| Recovery | Restart Edge. Pending events remain in the local store. Heartbeat resumes. `GATEWAY_RECOVERED` if an open offline alert exists. |
| Validation | Gateway liveness `ONLINE`. Sync snapshot moves out of `ERROR`. |
| User impact | Central live weight may stop. Local weighment can continue under offline policy. |
| Data loss | Only events that never completed `atomicWriteJson` can be missing. |

## E. Network failure

| | |
| --- | --- |
| Detection | Edge connectivity `OFFLINE`. Sync snapshot `OFFLINE` / retry. |
| Immediate action | Continue local operation. Do not bypass server validation when the link returns. |
| Recovery | Existing sync: order, duplicate `eventId`, retry, backoff, dead-letter, conflict handling (**IMPLEMENTED** in Step 17). |
| Validation | `ONLINE → OFFLINE → SYNCING → SYNCED` without duplicate transactions. |
| User impact | Central dashboard lags. Site can keep working if Edge is up. |
| Data loss | None for persisted local events. Server rejects invalid payloads on replay. |

## F. Power failure

| | |
| --- | --- |
| Detection | Hosts stop. After power-on, treat as combined B + D + G. |
| Immediate action | Confirm UPS status. Inspect Edge store file; `recoverTempFile` restores a `.bak` if the main file is missing. |
| Recovery | Boot database, API, web, Edge. Do not auto-complete transactions. |
| Validation | Local queue stats, last transaction status, `/health/ready`. |
| User impact | Full site stop until power and UPS hold. |
| Data loss | Unflushed OS buffers and in-progress writes. **RECOMMENDED FOR PRODUCTION:** UPS on weighbridge PC, Edge host, and database. The application does not claim electrical protection. |

## G. Server restart

| | |
| --- | --- |
| Detection | Process exit / host reboot. |
| Immediate action | Start PostgreSQL, API, web, Edge in that order when possible. |
| Recovery | Sessions that are still valid remain. Reliability scan and optional backup scheduler resume. |
| Validation | Transactions intact. Pending sync resumes. Notifications and audit rows unchanged. No duplicate transactions. |
| User impact | Short outage. |
| Data loss | Same as B. |

## H. Duplicate synchronization

| | |
| --- | --- |
| Detection | Same `eventId` ingested twice. Server unique constraint + Edge enqueue no-op. |
| Immediate action | None. Duplicate is ignored. |
| Recovery | Keep the first accepted event. |
| Validation | One `EdgeIngestedEvent` per `gatewayId + eventId`. |
| User impact | None. |
| Data loss | None. |

## I. Corrupted event

| | |
| --- | --- |
| Detection | Envelope validation failure or dead-letter after retries. `SYNC_FAILURE` if dead-letter count rises. |
| Immediate action | Inspect dead-letter on the Sync page. Do not delete blindly. |
| Recovery | Correct payload or re-queue per existing sync tools. Server validation is not bypassed. |
| Validation | Dead-letter list and conflict list. |
| User impact | That event stays local until fixed. |
| Data loss | Possible for that event only if discarded after review. |

## J. Failed transaction

| | |
| --- | --- |
| Detection | Status `EXCEPTION` / `ON_HOLD`, or stale intermediate status (`STALE_TRANSACTION` warning). |
| Immediate action | Do **not** auto-complete or auto-cancel. Operator continues or resolves with existing workflow rules. |
| Recovery | Existing correction / exception paths. Consistency report is read-only. |
| Validation | Transaction remains in last saved status after restart. |
| User impact | Vehicle may wait. Warning: "Transaction requires attention." |
| Data loss | None if the last step was committed. |

## K. Failed backup

| | |
| --- | --- |
| Detection | `BackupRun` `FAILED`. Status API `FAILED` or `REQUIRES_INFRASTRUCTURE`. `BACKUP_FAILED` notification (one per day). |
| Immediate action | Keep the last successful dump. Do not delete it. Check `pg_dump` PATH and disk space. |
| Recovery | Fix infrastructure. Next verified success emits `BACKUP_RECOVERED`. |
| Validation | New `SUCCESS` row with size and checksum. |
| User impact | None immediately. Restore window grows until a good dump exists. |
| Data loss | Risk increases until a verified backup exists. Application dumps are optional; production still needs operator backups. |

---

## Stale work and devices (IMPLEMENTED)

- Intermediate transactions older than configurable hours get a warning and `STALE_TRANSACTION` alert. They are never auto-cancelled.
- Gateways: `ONLINE` / `STALE` / `OFFLINE`. Alerts are deduped (`eventKey` per day).
- Consistency and audit checks write a report only. Missing audit rows are **not** fabricated.

---

## Failure simulation (development only)

`SIMULATE_DATABASE_UNAVAILABLE`, `SIMULATE_EDGE_OFFLINE`, `SIMULATE_SYNC_FAILURE`, `SIMULATE_PROVIDER_UNAVAILABLE`.

Disabled by default. Ignored when `NODE_ENV=production`. Not exposed to ordinary users.
