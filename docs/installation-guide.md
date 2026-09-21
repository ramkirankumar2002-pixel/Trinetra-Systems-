# Installation guide (Trinetra Systems V1.0)

Software install only. This does not commission weighbridge hardware.

## Prerequisites

- Node.js 20 or newer
- pnpm 10 (repository `packageManager` field)
- PostgreSQL 14 or newer
- Optional: `pg_dump` on PATH if application-level backups are enabled

## Development install

```bash
pnpm install
copy apps\api\.env.example apps\api\.env
copy apps\web\.env.example apps\web\.env
copy apps\edge\.env.example apps\edge\.env
```

Edit `apps/api/.env`: set `DATABASE_URL` and a non-empty `JWT_SECRET`. Do not commit `.env`.

```bash
pnpm db:generate
pnpm --filter @trinetra/api db:migrate:deploy
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

Optional Edge simulator:

```bash
pnpm dev:edge
```

The Edge control UI binds to `127.0.0.1` only. See `docs/edge-gateway.md`.

## Production-style install (controlled pilot)

1. Provision PostgreSQL with a least-privilege application role.
2. Copy environment templates and set production values (see `docs/configuration-guide.md`).
3. Run `pnpm validate:config` from the API working directory (after copying `.env`).
4. `pnpm --filter @trinetra/api db:migrate:deploy` against the empty or previously migrated database.
5. **Do not** run `pnpm db:seed` on a customer database.
6. Build:

```bash
pnpm build:api
pnpm build:web
pnpm build:edge
```

7. Serve `apps/web/dist` over HTTPS behind a reverse proxy that forwards `/api` to the API.
8. Start the API with `node dist/index.js` from `apps/api` after `NODE_ENV=production`.
9. Start Edge on the site host only after unique gateway credentials are issued.

Firebase Hosting for the web UI is documented in [docs/firebase-deployment.md](./firebase-deployment.md). Hosting does not replace PostgreSQL or the Edge Gateway.

## Database

Migrations live in `apps/api/prisma/migrations`. Apply them in timestamp order. Do not drop the development database to “fix” a customer database.

## Security

`.env`, passwords, API secrets, webhook secrets, and database dumps must stay off source control. See `docs/security-review.md`.
