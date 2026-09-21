# Environment configuration

Runtime configuration is environment-based. Copy `apps/api/.env.example` to `apps/api/.env` (gitignored). Never commit real secrets.

This document lists variables without secret values.

## Environments

| Environment | `NODE_ENV` | Notes |
| --- | --- | --- |
| Development | `development` (default) | Local CORS, placeholder JWT allowed if non-empty, simulation flags honored |
| Test | typically `test` / `development` | Automated tests against local PostgreSQL |
| Production | `production` | Placeholder/short JWT rejected; CORS cannot be `*` or empty; `DATABASE_URL` required; simulation flags ignored; HSTS on; webhook HTTPS + private-host block |

Do not use development credentials, the seeded demo password, or `CORS_ORIGIN=*` in production.

## Required for login and production

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection. Required in production. |
| `JWT_SECRET` | Signs session cookies. Required always. Production: random, ≥32 characters, not the example placeholder. |
| `CORS_ORIGIN` | Allowed browser origins, comma-separated. Production: explicit HTTPS origins. |
| `NODE_ENV` | `production` for live. |

## Authentication

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `8h` | Cookie and JWT lifetime. Production maximum 7 days. Formats: `3600s`, `8h`, `1d`. |
| `AUTH_COOKIE_NAME` | `trinetra_session` | Cookie name |
| `ALLOW_DEMO_SEED` | unset/false | Demo seed is blocked when `NODE_ENV=production` unless true |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | Login window |
| `AUTH_RATE_LIMIT_MAX` | `10` | Max attempts per email+IP |
| `TRUST_PROXY` | `false` | Set true only behind a trusted reverse proxy |

## Integrations

| Variable | Default | Purpose |
| --- | --- | --- |
| `INTEGRATION_ENCRYPTION_KEY` | empty (falls back to `JWT_SECRET`) | AES key material for stored webhook secrets |
| `INTEGRATION_WEBHOOK_TIMEOUT_MS` | `10000` | Delivery timeout |
| `INTEGRATION_DELIVERY_INTERVAL_MS` | `5000` | Worker poll interval |

## Files and hardware simulation

| Variable | Purpose |
| --- | --- |
| `DOCUMENT_MAX_BYTES` / `DOCUMENT_STORAGE_DIR` / `DOCUMENT_TYPES` | Upload limits and local store |
| `ANPR_*` | Simulated ANPR plates, confidence, evidence retention/dir |
| `WEIGHMENT_*` | Min/max kg; optional simulated kg |
| `EDGE_INGEST_MAX_BYTES` / `GATEWAY_*` | Edge payload and heartbeat |
| `DRIVER_*` | Driver mode feature flags |
| `BACKUP_*` | Optional `pg_dump` (disabled by default) |
| `SIMULATE_*` | Development failure injection; ignored in production |
| `LOG_LEVEL` / `SLOW_*` / `MONITORING_*` | Observability thresholds |

## Frontend

The web app uses the Vite proxy to `/api` in development. Production must serve the SPA over HTTPS and point it at the API origin allowed in `CORS_ORIGIN`. Do not put `JWT_SECRET` or database URLs in frontend code.

## Edge Gateway

Edge environment files must use a unique production credential. The documented development `tgw_devonly_...` value must never be used on a live site.

## Checks at process start (production)

- `JWT_SECRET` present, not placeholder, length ≥ 32
- `JWT_EXPIRES_IN` parseable and ≤ 7 days
- `CORS_ORIGIN` non-empty and not `*`
- `DATABASE_URL` present

CLI (does not print secret values):

```bash
pnpm validate:config
```

Reports **OK**, **WARNING**, or **ERROR** per check. Process exit code 1 if any ERROR.
