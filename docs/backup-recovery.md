# Backup and recovery

Step 20 adds an application-level backup **status**, optional `pg_dump` execution, verification, conservative retention, and a recovery dashboard. It does **not** replace operator-managed PostgreSQL backups.

Distinguish:

| Status | Meaning |
| --- | --- |
| **IMPLEMENTED** | Present in this repository and exercisable in development. |
| **RECOMMENDED FOR PRODUCTION** | Required before treating disaster recovery as complete. Not provided by this application alone. |

This process does **not** protect against physical hardware damage or electrical failure. Production sites need UPS / power protection.

---

## Current PostgreSQL setup

| Item | Value |
| --- | --- |
| Database name | From `DATABASE_URL` path (example in `.env.example`: `trinetra`) |
| ORM | Prisma 6 (`apps/api/prisma/schema.prisma`) |
| Migration strategy | Forward-only SQL under `apps/api/prisma/migrations` via `prisma migrate deploy` |
| Application health | `GET /health` (process), `GET /health/live` (liveness), `GET /health/ready` (PostgreSQL reachable) |

The API can start without PostgreSQL. Login, transactions, notifications, and backup metadata **require** the database.

### Important production data

- Organizations, sites, users, roles, sessions
- Vehicles, materials, workflows
- Transactions, weighments, documents, approvals, unloading
- Audit logs, notifications, operational alerts
- Edge gateway registration, sync snapshots, ingested events
- Weight anomaly / security events
- Backup run metadata (`BackupRun`)

### Critical tables (non-exhaustive)

`Transaction`, `Weighment`, `Document`, `Approval`, `Unloading`, `AuditLog`, `User`, `Session`, `EdgeGateway`, `EdgeIngestedEvent`, `EdgeSyncSnapshot`, `OperationalAlert`, `Notification`, `WeightAnomalyEvent`.

### Backup requirements

- Credentials stay in environment variables. Database passwords are never stored in source code or returned by APIs.
- Backup files are written under `BACKUP_DIRECTORY` (default `apps/api/storage/backups`). That tree is gitignored and is **not** exposed through the frontend.
- A file on disk is not treated as success until the process exits 0, the file exists, and the size is at least 64 bytes.
- Partial files use a `.partial` suffix and are deleted on failure. Successful dumps are renamed to `.dump`. A failed run never overwrites a previous successful `.dump`.
- Retention never deletes the only known successful backup.

---

## Configuration (IMPLEMENTED)

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKUP_ENABLED` | `false` | Must be true before any dump runs |
| `BACKUP_DIRECTORY` | `storage/backups` | Writable directory outside source |
| `BACKUP_RETENTION_DAYS` | `14` | Age after which extra successful backups may be deleted |
| `BACKUP_INTERVAL_MS` | `0` | In-process scheduler. `0` disables scheduled runs |

Manual trigger: `POST /api/v1/reliability/backups` requires `reliability.manage`.

There is **no** restore API.

---

## Optional automated dump (IMPLEMENTED, infrastructure-dependent)

When `BACKUP_ENABLED=true`, the API can spawn `pg_dump -F c` using `DATABASE_URL`. Requirements:

- `pg_dump` on the API host `PATH`
- Network reachability to PostgreSQL
- Write permission on `BACKUP_DIRECTORY`

If `pg_dump` is missing, the run is stored as `FAILED` with `PG_DUMP_NOT_FOUND`. Status then shows `REQUIRES_INFRASTRUCTURE` until a verified success exists.

This is **not** a substitute for WAL archiving or point-in-time recovery.

---

## Recommended production backup approaches (RECOMMENDED FOR PRODUCTION)

### Full database backup

Use PostgreSQL custom or directory format from the database host or a backup agent, not from the web process if you can avoid it:

```text
pg_dump -h HOST -p 5432 -U USER -d trinetra -F c -f trinetra-YYYYMMDD.dump
```

Keep dumps off the application disk (object storage or a backup server). Encrypt at rest. Test restore on a **recovery** database.

### Incremental / WAL-based recovery (future production option)

Enable `wal_level=replica`, archive WAL, and use `pg_basebackup` plus PITR. This is **not implemented** in the application. Plan it with the hosting operator.

### Frequency

- Application optional dump: daily if `BACKUP_INTERVAL_MS=86400000` and `pg_dump` is available.
- Production: at least daily full dump **and** continuous WAL archive.

### Retention

Keep at least 14 days of verified backups, plus one monthly copy. Never delete the only valid backup. The in-app retention job follows `BACKUP_RETENTION_DAYS` and skips `keep=true` rows.

### Verification

Confirm:

1. Process exit code 0
2. File exists
3. Size is reasonable
4. Metadata row is `SUCCESS` with checksum
5. Periodic restore into a recovery database (operator procedure)

### Restore procedure

See [restore-procedure.md](./restore-procedure.md). Restore remains an infrastructure/administrator operation.

---

## Status API (IMPLEMENTED)

`GET /api/v1/reliability/status` (`reliability.read`) returns only safe metadata:

- last successful / failed timestamps
- public backup status
- last successful size
- dependency health (`AVAILABLE`, `DEGRADED`, `UNAVAILABLE`, `DISABLED`, `SIMULATION`)

It does **not** return passwords, connection strings, credentials, or backup file bytes.

---

## What is still required in production

- Operator-owned PostgreSQL backup and WAL archive
- Off-host storage and encryption
- Scheduled restore tests
- UPS / generator for weighbridge PCs and the database host
- Monitoring of `/health/ready` from an external checker
