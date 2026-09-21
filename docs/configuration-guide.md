# Configuration guide (Trinetra Systems V1.0)

Placeholder values only. Never paste live secrets into documentation.

Full variable list: `docs/environment-configuration.md` and `apps/api/.env.example`.

## Production checklist (software)

Set:

- `NODE_ENV=production`
- `DATABASE_URL` (PostgreSQL URI)
- `JWT_SECRET` (random, ≥32 characters, not the example placeholder)
- `JWT_EXPIRES_IN` (for example `8h`; maximum 7 days in production)
- `CORS_ORIGIN` (explicit HTTPS origins; not `*`)
- `DOCUMENT_STORAGE_DIR` and `ANPR_EVIDENCE_STORAGE_DIR` outside source trees
- `INTEGRATION_ENCRYPTION_KEY` (recommended dedicated key)
- Unique Edge `EDGE_GATEWAY_TOKEN` (never `tgw_devonly_...`)

Validate without printing secrets:

```bash
pnpm validate:config
```

Exit code 1 means one or more **ERROR** checks. **WARNING** items should be reviewed before go-live.

## Development vs production

| Topic | Development | Production |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| CORS | `http://localhost:5173` | Explicit HTTPS origins |
| Simulation flags | Honored | Ignored |
| Webhook HTTP / private hosts | Allowed for tests | Blocked |
| Demo seed | Default path | Blocked unless `ALLOW_DEMO_SEED=true` on an isolated DB |
| HSTS | Off | On (API headers; TLS still terminated at the proxy) |

## Frontend

`VITE_API_URL` stays empty in local Vite so `/api` is proxied. Production must not embed `JWT_SECRET` or `DATABASE_URL` in the browser bundle.

## Edge Gateway

See `apps/edge/.env.example`. `EDGE_SIMULATOR=true` is for demonstration. A live site needs `EDGE_BUILD_ENV=production`, a unique token, and manufacturer adapters.

## Backups

`BACKUP_ENABLED` defaults to false. Application `pg_dump` is optional. Production still needs operator-managed PostgreSQL backups (`docs/backup-recovery.md`).
