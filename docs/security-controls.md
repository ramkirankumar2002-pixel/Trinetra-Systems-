# Security controls (Step 33)

Technical controls present in the Trinetra Systems application. This is not a claim that the system is “secure” or certified.

## Authentication

- Passwords hashed with bcrypt (12 rounds), 72-character maximum.
- Dummy bcrypt compare on unknown emails.
- Generic login error: `Invalid email or password`.
- Session JWT in httpOnly cookie (`trinetra_session`), `sameSite=lax`, `secure` when `NODE_ENV=production`.
- Session row must be unrevoked and unexpired; user must be active.
- Logout sets `revokedAt` and clears the cookie.
- Login rate limit: `AUTH_RATE_LIMIT_MAX` per email+IP per `AUTH_RATE_LIMIT_WINDOW_MS` (defaults 10 / 15 minutes).
- MFA, SSO, and password-reset APIs are **not implemented** (future enhancement).

## Authorization

Typical stack: authentication → permission OR-list → organization filter → site/weighbridge checks.

- Other-organization resources: **404**.
- Same-organization unauthorized site: **403**.
- Integration credentials authenticate `/api/v1/ext` only, not user session routes.
- Frontend `PermissionRoute` / nav hiding is UX only.

## Multi-tenant isolation

Enforced in services, not only in the UI. See `docs/tenant-security.md`.

Demo seed roles are often organization-wide. Production assignments should set `UserRole.siteId` when site isolation is required.

## API

- Versioned under `/api/v1`. Existing session routes remain.
- JSON body 1 MB; edge ingest `EDGE_INGEST_MAX_BYTES`; documents `DOCUMENT_MAX_BYTES`.
- Route IDs: `[A-Za-z0-9_-]{1,128}`, no `..` `/` `\` NUL.
- Prisma parameterized queries; report SQL uses `Prisma.sql` fragments with bound values.
- Production error JSON omits stacks, SQL, and filesystem paths.
- CORS from `CORS_ORIGIN`; production refuses empty or `*`.
- Security headers: nosniff, DENY frames, referrer no-referrer, Permissions-Policy, CORP same-site, API CSP `default-src 'none'`, `Cache-Control: no-store`, HSTS in production only.
- `X-Powered-By` disabled.

## Integration platform

- Hashed API secrets; plaintext shown once.
- Scopes default to `ORGANIZATION_READ`.
- Writes cannot change completed weights, approvals, RBAC, audit, or billing (billing module absent).
- Idempotency keys unique per organization/application/endpoint.
- Webhooks: signed `sha256=` HMAC, timestamp + event id, encrypted secret, retries then dead-letter, transaction success independent of delivery.
- Production webhooks: HTTPS, blocked private/metadata hosts, DNS resolution check.
- Request logs omit Authorization, secrets, and document bytes.

## Documents and files

- Magic-byte MIME: PDF, JPEG, PNG, WEBP.
- Executable extensions rejected.
- Storage outside `src/`.
- Download: attachment, nosniff, `private, no-store`.
- Public JSON does not include `storageKey`.

## Integrity

- Net weight calculated server-side on finalize.
- Completed / cancelled transactions refuse silent mutation (`assertTransactionMutable`).
- Illegal workflow jumps blocked by `canTransition`.
- Weight anomalies are observations (not “fraud detected”).
- Audit log has no delete/update HTTP API.

## Logging

- Structured JSON with field-name and value-prefix redaction.
- Correlation / request IDs on API errors.
- Application logs are not the authoritative audit trail.

## Rate limits (application)

| Surface | Default | Store |
| --- | --- | --- |
| Login | 10 / 15 min / email+IP | Memory |
| Sensitive config writes | 40 / 15 min / user+IP | Memory |
| Reports | 60 / min / user+IP | Memory |
| Document uploads | 30 / 15 min / user+IP | Memory |
| Integration API | 60 / min and 1200 / hour per credential | Memory |

## Residual controls operators must add

HTTPS termination, trusted `TRUST_PROXY`, unique production secrets, PostgreSQL least privilege, WAL/PITR backups, WAF, log shipping, network segmentation for indicators/cameras, physical cabinet controls, and third-party penetration testing.
