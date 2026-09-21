# Database migration safety

Prisma migrations live in `apps/api/prisma/migrations`. The schema is `apps/api/prisma/schema.prisma`.

**IMPLEMENTED:** forward-only SQL migrations, `prisma migrate deploy` / `prisma migrate dev` scripts, `prisma validate`.

**NOT IMPLEMENTED / NEVER DO IN PRODUCTION:** automatic production reset, destructive development commands against a shared database, silent data deletion during migrate.

---

## Commands

| Command | Use |
| --- | --- |
| `corepack pnpm exec prisma validate` | Check the schema file. Safe anytime. |
| `corepack pnpm exec prisma migrate status` | Compare applied migrations to the folder. |
| `corepack pnpm exec prisma migrate deploy` | Apply **pending** migrations. Use this in production. Review SQL first. |
| `corepack pnpm exec prisma migrate dev` | Local development only. Can prompt for names and create SQL. |
| `corepack pnpm exec prisma generate` | Refresh the client. Does not change data. |
| `prisma migrate reset` | **Development only.** Drops the database. **Never** run against production. |
| `prisma db push` | Do not use on production. Can drift from migration history. |

---

## Production practice (RECOMMENDED FOR PRODUCTION)

1. Take a verified PostgreSQL backup (operator dump or WAL-based copy) **before** migrate.
2. Read every new `migration.sql` file. Confirm it does not `DROP TABLE` or drop columns that still hold data unless a backfill already ran.
3. Apply to a staging clone first. Run API tests against that clone.
4. Run `prisma migrate deploy` during a write pause if the migration locks hot tables.
5. Start the API and hit `/health/ready`.
6. Spot-check transactions, weighments, and a login.

Never:

- Point a developer `.env` `DATABASE_URL` at production.
- Use `migrate reset`, `db push --force-reset`, or seed scripts that truncate operational tables on production.
- Delete existing operational rows as part of a "cleanup" migration.

---

## Step 20 migration

`20260921100000_backup_recovery` adds `BackupRun` and grants `reliability.read` / `reliability.manage` to `ADMIN`, `SUPERVISOR`, and `OFFICE_MANAGER`. It does not alter transaction or weighment tables.

---

## If a migration fails

1. Stop the API if it is mid-deploy.
2. Do not invent a second migration that "undoes" data unless you have a reviewed down-script. Prisma migrations in this repo are treated as forward-only.
3. Restore the pre-migrate backup onto a recovery database and inspect.
4. Fix the SQL, deploy to staging again, then production.
