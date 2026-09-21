# Troubleshooting guide (Trinetra Systems V1.0)

Do not paste secrets, tokens, or connection strings into tickets.

## API will not start

- `JWT_SECRET is required` — set `JWT_SECRET` in `apps/api/.env`.
- Production JWT length / placeholder — use a random value ≥32 characters.
- `CORS_ORIGIN cannot be empty or * in production` — list explicit origins.
- `DATABASE_URL is required in production` — set a PostgreSQL URI.
- Run `pnpm validate:config` and read **ERROR** lines (values are not printed).

## Cannot sign in

- Wrong email/password returns a generic message (no account enumeration).
- Inactive users and archived organizations cannot use a normal session.
- `inactive@demo.local` is an intentional demo inactive account.
- Rate limit: too many attempts per email+IP (default 10 / 15 minutes).

## Empty dashboard or 401 on APIs

- Cookie `trinetra_session` must be first-party (use the Vite proxy or same-site HTTPS).
- Missing permission: UI hides modules, but the API is authoritative.

## Documents fail to upload

- File type/size (default 10 MB, magic-byte MIME).
- Storage directory must be writable and not inside `src/`.
- Path traversal in filenames is rejected.

## Weighment / workflow stuck

- Required document or approval not completed.
- Completed transactions cannot be silently edited — use controlled correction if permitted.
- Simulated device: confirm the UI says simulated before treating the figure as live.

## Edge Gateway

- Token must start with `tgw_`.
- Production rejects the `devonly` development token.
- Control port binds to `127.0.0.1` only.
- Failed events remain in dead-letter; they are not deleted to “make sync look green”.

## Webhooks

- Production URLs must be HTTPS and public (private IPs blocked).
- Receivers must verify `X-Trinetra-Signature` and timestamp freshness.
- Failed delivery does not undo the source transaction.

## Database

- Apply migrations with `prisma migrate deploy`. Do not reset a customer database.
- Demo seed is blocked in production unless `ALLOW_DEMO_SEED=true` on an isolated DB.

## Still stuck

Open a support ticket in the app (if entitled) or contact the implementation engineer. Include request id / reference id from the error JSON, not passwords.
