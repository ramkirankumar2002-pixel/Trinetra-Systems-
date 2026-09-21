# Firebase deployment (Trinetra Systems V1.0)

Firebase Hosting serves the web app. The API remains Express + PostgreSQL (Prisma). That is **not** Cloud Firestore. A full working site needs:

1. Firebase Hosting (this repo)
2. Cloud Functions `api` (this repo) **or** another HTTPS API
3. A reachable PostgreSQL database (Cloud SQL or equivalent)
4. Blaze billing if you deploy Cloud Functions / Cloud SQL

The Edge Gateway is site-local and is **not** deployed to Firebase.

## Project

- Firebase project ID: `trinetra-systems-2026`
- Hosting URL (after deploy): `https://trinetra-systems-2026.web.app`

## Frontend

```bash
pnpm build:web
firebase deploy --only hosting --project trinetra-systems-2026
```

The SPA is served from `apps/web/dist`. Client-side routes rewrite to `index.html`. `/api/**` and `/health` rewrite to the `api` Cloud Function when that function is deployed.

## API (Cloud Functions)

```bash
pnpm --filter @trinetra/api build
firebase deploy --only functions:api --project trinetra-systems-2026
```

Set secrets in Google Cloud Secret Manager / Firebase (do not commit values):

- `DATABASE_URL`
- `JWT_SECRET` (≥32 characters, not the example placeholder)
- `CORS_ORIGIN` — `https://trinetra-systems-2026.web.app` (and custom domain if used)
- `NODE_ENV=production`
- `INTEGRATION_ENCRYPTION_KEY` (recommended)

Same-origin Hosting rewrites keep the session cookie first-party. Do not use `CORS_ORIGIN=*`.

## What Firebase Hosting does not replace

- PostgreSQL / Prisma migrations (`prisma migrate deploy` against the production database)
- Document and ANPR files on local disk (Cloud Functions filesystems are ephemeral)
- Real weighbridge serial/TCP devices
- Demo seed (do not seed a customer database)

## Local Firebase login

Already used by this workspace: `firebase login` as the operator Google account. `.firebaserc` selects `trinetra-systems-2026`.
