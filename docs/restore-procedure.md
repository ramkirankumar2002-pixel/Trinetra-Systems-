# Restore procedure

Database restoration is an **infrastructure / administrator** operation.

**IMPLEMENTED:** this written procedure, backup verification metadata, health checks after the API starts.

**NOT IMPLEMENTED:** an API or UI that restores or overwrites the production database. Do not add one.

---

## Before you start

1. Confirm you have a **verified** backup (`BackupRun.status = SUCCESS`, or an operator `pg_dump` / base backup that has been restore-tested).
2. Work on a **recovery** database or environment first. Do not restore over production until that recovery copy is validated.
3. Record the incident time, last known good transaction reference, and who authorized the restore.

---

## Safe restore sequence

1. **Stop application writes.** Stop the API process and Edge ingest. Leave the frontend up only if it can show a maintenance message; users must not submit weighments.
2. **Verify the backup.** Confirm the file exists, size is reasonable, and (if using the app metadata) the run is `SUCCESS` with a checksum. Do not use `.partial` files.
3. **Create a recovery database / environment.** Example: `trinetra_recovery`. Keep production untouched until step 11.
4. **Restore PostgreSQL.**

   ```text
   pg_restore -h HOST -p 5432 -U USER -d trinetra_recovery --clean --if-exists trinetra-YYYYMMDD.dump
   ```

   For WAL/PITR, follow the operator runbook to a named recovery target time. That path is **RECOMMENDED FOR PRODUCTION** and is not automated here.

5. **Verify schema.** Compare Prisma schema to the restored database:

   ```text
   corepack pnpm exec prisma migrate status
   corepack pnpm exec prisma validate
   ```

   Do not run `prisma migrate reset` against any shared or production database.

6. **Verify important data.** Spot-check recent transactions, weighments, approvals, unloading rows, audit logs, and gateway registrations. Confirm net weights still match stored gross/tare.
7. **Run Prisma validation where appropriate.** `prisma validate` and, if needed, `prisma migrate deploy` **only** if the restored dump is behind known forward migrations. Review SQL first.
8. **Start the backend** against the recovery `DATABASE_URL`.
9. **Run health checks.** `GET /health/live` must be `ok`. `GET /health/ready` must not be `unavailable`.
10. **Verify transaction integrity.** Open a transaction that was in progress at failure time. It must still be in its last **saved** status. Do **not** mark incomplete work completed. Operators continue through the existing workflow.
11. **Re-enable application writes.** Point production at the validated database only after sign-off. Start Edge gateways and confirm pending local events sync without creating duplicate transactions.

---

## After restore

- Confirm notifications and audit history are present. Do not fabricate missing audit rows.
- If Edge queues replay, server-side duplicate protection (`eventId`) must accept already-ingested events.
- Record the restore in the operational log. The application will not invent historical `BACKUP_*` audit rows for operator `pg_restore`.

---

## What this application will not do

- Restore from the Recovery page
- Overwrite production from a browser session
- Serve backup files to the frontend
- Claim point-in-time recovery unless WAL archive was configured outside this repo
