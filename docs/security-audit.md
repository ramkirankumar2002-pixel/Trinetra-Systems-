# Trinetra Systems security audit (Step 19)

This document records the Step 19 application-level security review of the existing platform. It is not a penetration-test report and does not claim the system is fully secure.

Findings are classified as CRITICAL, HIGH, MEDIUM, LOW, or INFORMATIONAL.

Where a finding was practical to fix in this step, the status is **Fixed**. Remaining items are documented as accepted limitations or follow-up work.

No secret values are included in this document. If a real secret was present in a local ignored file, it is reported only as “Potential hard-coded secret detected.”

## CRITICAL

None verified in the reviewed application source.

## HIGH

### H1. Inactive-account login enumerated valid users

- **Area:** Authentication
- **Finding:** `loginUser` returned a distinct `"This account is inactive"` message after locating a matching email. An attacker could confirm that an account exists.
- **Status:** **Fixed.** Failed login now always returns `"Invalid email or password"`. Missing-user attempts still pay a bcrypt compare against a dummy hash so timing is closer to a real user lookup.

### H2. Operational alert write routes used `dashboard.read`

- **Area:** Authorization
- **Finding:** `POST /api/v1/alerts/:id/acknowledge` and `.../resolve` were gated only by `dashboard.read`. The service layer also allowed `report.read` or the SUPERVISOR role, so Office Managers and any dashboard reader who reached the service check could change alert state.
- **Status:** **Fixed.** Routes now require `security.acknowledge`. Service management now requires `security.acknowledge` or the ADMIN role. Concurrent ACK/RESOLVE uses `updateMany` with the expected current status.

### H3. Weak or empty JWT secret accepted outside production

- **Area:** Session / configuration
- **Finding:** An empty JWT secret could still sign tokens in non-production. The documented placeholder secret is accepted in development. A mis-set `NODE_ENV` plus a placeholder secret is a production risk.
- **Status:** **Fixed in production path.** Startup now refuses an empty secret in every environment and refuses a placeholder or short secret when `NODE_ENV=production`. Development may still use the documented placeholder; that remains a local-only risk.

## MEDIUM

### M1. Missing HTTP security headers

- **Area:** API configuration
- **Finding:** Express disabled `X-Powered-By` and set CORS, but did not set nosniff, frame denial, referrer policy, or HSTS.
- **Status:** **Fixed.** A small header middleware now sets those values. HSTS is enabled only in production.

### M2. Login timing differed when no user existed

- **Area:** Authentication
- **Finding:** Unknown emails skipped bcrypt comparison.
- **Status:** **Fixed.** See H1.

### M3. Route IDs were not validated

- **Area:** Input validation
- **Finding:** `routeParam` accepted empty strings and unsafe path-like values, leaving IDOR and storage-path probes to later 404s.
- **Status:** **Fixed.** Route IDs must be 1–128 characters of `[A-Za-z0-9_-]` and cannot contain `..`, `/`, `\`, or NUL.

### M4. Prisma unique/not-found errors could become generic 500s

- **Area:** Error handling
- **Finding:** Unexpected Prisma known-request errors were logged as raw objects and returned as `Internal server error`.
- **Status:** **Fixed.** P2002 → 409, P2025 → 404, other known Prisma errors → 400 without query or connection details.

### M5. Finalize and unloading completion used unconditional row updates

- **Area:** Concurrency
- **Finding:** Approvals already claimed PENDING rows with `updateMany`. Finalize and unloading completion updated by primary key after a read, so two concurrent callers could both pass the state check.
- **Status:** **Fixed.** Completion now claims `SECOND_WEIGHMENT → COMPLETED` and unloading claims `UNLOADING → UNLOADED`. Weight-anomaly ACK/RESOLVE/FALSE_POSITIVE use the same claim pattern.

### M6. Same email can exist in two organizations

- **Area:** Authentication
- **Finding:** Email uniqueness is `(organizationId, email)`. `loginUser` requires exactly one active match across all organizations. Two demo tenants with the same email cannot log in.
- **Status:** Accepted for this step. Login still fails closed with a generic message.

### M7. Org-wide roles bypass site checks

- **Area:** Authorization / IDOR
- **Finding:** `canAccessSite` treats any role with `site === null` as organization-wide. Seeded demo assignments are org-wide, so site isolation is not exercised by default demo users.
- **Status:** Existing design. Documented. Not changed, because tightening it would alter seeded operator behavior.

### M8. Vehicles are organization-scoped, not site-scoped

- **Area:** Authorization
- **Finding:** Vehicle records have no site foreign key. A site-limited user in an org-wide role can read any vehicle in the organization.
- **Status:** Existing data model. Documented.

### M9. No user-management API despite `user.manage`

- **Area:** Authorization / audit
- **Finding:** Permissions exist for user and role administration, but there is no HTTP API to create users, change roles, or reset passwords. User changes happen through seed or direct database access.
- **Status:** Not implemented. Documented as a production-readiness gap.

### M10. SecurityEvent resolve actor is incomplete

- **Area:** Security events
- **Finding:** `SecurityEvent` stores `acknowledgedByUserId` / `acknowledgedAt` only. Resolve and false-positive actors are stored on `WeightAnomalyEvent`.
- **Status:** Accepted without a schema change. Weight-anomaly events remain the authoritative review record.

## LOW

### L1. No request identifier on API logs

- **Status:** **Fixed.** `X-Request-Id` is accepted (strict charset) or generated. Error payloads include `requestId`. Logs are structured JSON with redaction of common secret fields.

### L2. Configuration writes had no dedicated rate limit

- **Status:** **Fixed.** Login already had an email+IP limiter. Workflow writes, gateway lifecycle writes, hardware enable/disable/config, and anomaly-config writes now share a modest mutation limiter. Live weight, weighment, edge ingest, and heartbeat are not limited by that limiter.

### L3. CORS `*` with credentials

- **Status:** **Fixed in production.** Startup rejects empty or `*` CORS in production. Development default remains `http://localhost:5173`. Comma-separated origins are supported.

### L4. `TRUST_PROXY` was unset

- **Status:** **Fixed.** `TRUST_PROXY` defaults to false. Enable only behind a trusted reverse proxy so rate-limit keys see the client IP.

### L5. Development demo password is documented in seed output

- **Status:** INFORMATIONAL / accepted for local demo. The seed password is a published development credential, not a production secret. It must never be used in a real deployment.

### L6. JWT is cookie-only

- **Status:** Existing design. Bearer tokens in `Authorization` are not accepted for user sessions. Gateway credentials use Bearer or `X-Trinetra-Gateway-Token`.

## INFORMATIONAL

### I1. Passwords

Passwords are stored as bcrypt hashes (12 rounds, 72-character maximum). They are not returned on `/auth/me` or login JSON. Login sets an httpOnly cookie.

### I2. Audit logs

There is no application API to update or delete audit rows. Dashboard audit listing requires `audit.read`.

### I3. Documents

Uploads are size-limited, executable extensions are rejected, MIME is sniffed from magic bytes, storage keys are sanitized, and document reads require organization plus transaction site access. Files are returned as attachments with `nosniff`.

### I4. Transaction workflow

Backend `canTransition` blocks `ARRIVED → COMPLETED` and other illegal jumps. Finalize recalculates net weight server-side and refuses completed/rejected/cancelled mutations.

### I5. Edge / offline

Gateway identity is the credential hash, not a caller-supplied ID. Event envelopes that claim another `gatewayId`, organization, or site are rejected. Event IDs are globally unique. Dead-letter rows are not deleted by normal APIs.

### I6. Secrets in the repository

`.env` and `.env.*` are gitignored except `*.example` files. Example files contain placeholders only.

- Local ignored `.env` files may contain real credentials. **Potential hard-coded secret detected.** Those files were not opened or copied into this report.
- Seed and README publish the development login password `demo-password`. That is an intentional local demo credential.

### I7. Anomaly language

Weight anomalies and security events remain observations. They are not treated as proof of fraud.

## Practical fixes delivered in this step

1. Generic login failure for inactive and unknown accounts, with dummy bcrypt compare.
2. Tighter operational-alert authorization.
3. Production JWT / CORS / DATABASE_URL startup checks.
4. Security headers, request IDs, structured redacting logs.
5. Safe Prisma error mapping.
6. Route-ID validation.
7. Claim-style updates for finalize, unloading completion, alerts, and anomaly reviews.
8. Targeted configuration rate limits.
9. Future mutual-TLS extension types for gateways.
10. Security tests and the production-readiness checklist.

## Remaining residual risk

See `docs/security.md` (known limitations) and `docs/production-readiness-checklist.md`.
