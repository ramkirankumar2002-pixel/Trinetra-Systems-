# Trinetra Systems V1.0 release manifest

- **Product:** Trinetra Systems
- **Version:** 1.0.0
- **Release label:** V1.0
- **Build date:** 2026-09-21
- **API version path:** `/api/v1`

No secrets are included in this file.

## Build status

| Artifact | Command | Status |
| --- | --- | --- |
| Frontend | `pnpm build:web` (`tsc -b && vite build`) | Succeeded. Chunk-size warning (~573 kB JS). Sourcemaps off. |
| Backend | `pnpm build:api` (`tsc`) | Succeeded |
| Edge Gateway | `pnpm build:edge` (`tsc`) | Succeeded |
| Config validator | `pnpm validate:config` | Exit 0 on local development env: 9 OK, 1 WARNING (`NODE_ENV` not production), 0 ERROR. Secret values not printed. |

## Database migration status

| Check | Status |
| --- | --- |
| `prisma validate` | Schema valid |
| Migration files | 19 migrations in `apps/api/prisma/migrations` |
| `prisma migrate status` against local `trinetra` database | Database schema is up to date |
| Brand-new empty PostgreSQL created in this step | **NOT VERIFIED** (existing development database was not reset) |

## Test status

| Suite | Result |
| --- | --- |
| API (including Steps 5–33 plus Step 34 release tests) | **303 pass / 0 fail** |
| Web | **46 pass / 0 fail** |
| Edge | **19 pass / 0 fail** |
| Typecheck api/web/edge | Pass |

## Security status

Step 33 application review: **no confirmed BLOCKER**. See `docs/security-review.md`. External pentest **not** performed. `pnpm audit` (Step 33): 1 high advisory in Prisma `deepmerge-ts` — not upgraded.

## Known limitations

- Real indicators, cameras, ANPR, scanners, and physical gateways are **not** production-tested
- OCR/ANPR default to simulators
- No billing module
- No MFA / SSO / password-reset / user-admin HTTP API
- Backup restore **NOT VERIFIED**
- In-process rate limits and metrics
- Frontend bundle over 500 kB (warning only)
- Demo seed must not run on customer databases

## Performance sanity (local)

Tested: Windows development host, Node API `createApp()` bound to `127.0.0.1` ephemeral port, 20 sequential `GET /health` samples in `step34-release.test.ts`.

Observed: p95 under 500 ms (test assertion). This is **not** a capacity rating and does **not** support claims such as “10,000 users.”

Dashboard/report/query load testing: **NOT VERIFIED**.

## Source control before commit

Do **not** commit: `apps/api/.env`, `apps/web/.env`, `apps/edge/.env`, database dumps, `storage/`, `apps/edge/data/`, `dist/` build trees, personal credentials.

Confirmed gitignored: `apps/api/.env`, `apps/web/dist`. No PEM/private keys or AWS-style keys found in a repository content scan. Seeded `demo-password` is a documented development password, not a production secret.

The working tree is largely untracked (`apps/`, `docs/`). That is expected for this first freeze; it is not a license to add `.env` files.

## Required external dependencies

- PostgreSQL
- Node.js 20+
- Reverse proxy / TLS for production
- Operator-managed backups
- Site hardware and network (if going beyond simulation)
