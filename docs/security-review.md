# Security review (Step 33)

This is an application-level security and production-readiness review of the Trinetra Systems codebase after Steps 1–32.

It is **not** a penetration test, legal opinion, or compliance certification. Do not treat this document as ISO 27001, SOC 2, GDPR, DPDP Act, or PCI DSS evidence.

Statuses used below:

- **VERIFIED** — inspected and/or covered by automated tests in this step or earlier.
- **FIXED** — a confirmed issue was changed in this step.
- **NOT VERIFIED** — not exercised in a real production environment.
- **REQUIRES CONFIGURATION** — depends on operator environment.
- **REQUIRES EXTERNAL VALIDATION** — needs an independent security assessment.

No secret values are recorded here.

## Security inventory

| Area | Mechanism | Notes |
| --- | --- | --- |
| User authentication | Email + password, bcrypt (12), httpOnly JWT cookie | MFA / SSO / password reset **not implemented** |
| Session | JWT `jti` bound to `RefreshToken`; logout revokes row | Default 8h; production max 7 days |
| Login abuse | Per email+IP rate limit | In-process memory |
| Authorization | `requireAuthentication` + `requirePermission` + org/site service filters | Frontend hiding is not the boundary |
| Roles / permissions | Seeded RBAC catalog | ADMIN has catalog grants, not a hidden bypass except department middleware |
| Organization scope | `organizationId` on queries | Cross-org missing rows return 404 |
| Site scope | `assertSiteAccess` / `accessibleSiteIds` | Org-wide roles (`site = null`) skip site filters |
| Integration credentials | SHA-256 hashed API secrets, one-time reveal | `tsk_test_` / `tsk_live_` |
| Webhook secrets | AES-256-GCM ciphertext; HMAC-SHA256 signatures | One-time reveal; production HTTPS + private-host block + DNS check |
| Database credentials | `DATABASE_URL` environment | `.env` gitignored |
| File storage | Local directory, magic-byte MIME, size cap | Not object storage / antivirus |
| Document access | Auth + `transaction.read` + org + site | Storage key omitted from API JSON after this step |
| Gateway auth | Hashed `tgw_` credential | Claimed org/site must match gateway |
| Offline / edge | Event id idempotency, dead-letter retain | Local operator console is on-device |
| Sensitive data | Users, vehicles, documents, weights, tickets | See `docs/data-privacy-review.md` |
| Audit | Append-only via API (no delete route) | DB admin can still alter rows |
| Security events | ACK / RESOLVE / FALSE_POSITIVE | Observation language, not fraud verdicts |
| Secrets / config | Environment variables | Production JWT/CORS/DATABASE_URL startup checks |
| External integrations | `/api/v1/ext` + webhooks | No vendor ERP connectors |
| Billing | Not present in this repository | Not applicable |
| Support / maintenance | Org-scoped tickets; internal notes filtered | Customer close after RESOLVED |
| Backup | Optional `pg_dump` when enabled | Restore **NOT VERIFIED** |

## Findings

### S33-F01 — Document storage keys in session API JSON

- **Area:** Documents
- **Severity:** HIGH
- **Description:** `toPublicDocument` returned `storageKey`, exposing private relative storage paths to any caller with `transaction.read`.
- **Evidence:** `apps/api/src/modules/documents/mapper.ts` before this step.
- **Current state:** **FIXED.** Public document JSON no longer includes `storageKey`. Downloads still use `/api/v1/documents/:id/file` with authorization.
- **Verification status:** VERIFIED (unit test in `step33-security.test.ts`).

### S33-F02 — Webhook SSRF host bypasses

- **Area:** Integrations / webhooks
- **Severity:** HIGH
- **Description:** Production webhook validation blocked dotted IPv4 private ranges but not IPv6-mapped IPv4 (`::ffff:127.0.0.1`), unspecified `0.0.0.0` as a generic host check only, or DNS names that later resolve to private addresses.
- **Evidence:** `apps/api/src/domain/integration/webhookUrl.ts` (pre-change); delivery used the same check.
- **Current state:** **FIXED.** Host blocking covers mapped IPv6, `0.0.0.0/8`, CGNAT `100.64/10`, `.localhost`. Delivery also resolves DNS in production and rejects private resolved addresses.
- **Verification status:** VERIFIED for literal hosts (unit tests). DNS rebinding under live resolvers **REQUIRES EXTERNAL VALIDATION**.

### S33-F03 — Integration secrets not redacted by value prefix

- **Area:** Logging
- **Severity:** MEDIUM
- **Description:** Structured log redaction covered JWT-like strings, bcrypt hashes, and `tgw_`, but not `tsk_`, `whsec_`, `tapp_`, or `Bearer ` prefixes unless the field name matched.
- **Evidence:** `apps/api/src/lib/logger.ts`.
- **Current state:** **FIXED.**
- **Verification status:** VERIFIED (unit test).

### S33-F04 — Webhook encryption key tied only to JWT secret

- **Area:** Secret management
- **Severity:** MEDIUM
- **Description:** Webhook secret encryption derived from `JWT_SECRET` (or a development fallback string). Rotating the JWT secret would make stored webhook secrets unreadable. The development fallback is removed; JWT is required at process start.
- **Evidence:** `apps/api/src/domain/integration/secrets.ts`.
- **Current state:** **FIXED** by optional `INTEGRATION_ENCRYPTION_KEY` with JWT fallback. Operators should set a dedicated key before production.
- **Verification status:** REQUIRES CONFIGURATION.

### S33-F05 — Session TTL ignored `JWT_EXPIRES_IN`

- **Area:** Authentication
- **Severity:** LOW
- **Description:** Cookie and JWT lifetime were hardcoded to 8 hours while `JWT_EXPIRES_IN` was documented.
- **Current state:** **FIXED.** Duration is parsed from `JWT_EXPIRES_IN`. Production rejects invalid values and expiries longer than 7 days.
- **Verification status:** VERIFIED (unit parse tests). End-to-end expiry wait is **NOT VERIFIED**.

### S33-F06 — Report and document write amplification

- **Area:** API abuse
- **Severity:** LOW
- **Description:** Login and configuration writes were limited; expensive report queries and document uploads were not.
- **Current state:** **FIXED.** Report routes: 60 requests/minute/user. Document uploads: 30 / 15 minutes/user. In-process only.
- **Verification status:** VERIFIED in code. Load-tested limits **NOT VERIFIED**.

### S33-F07 — Ticket status/close routes gated only on `support.ticket.read`

- **Area:** Authorization
- **Severity:** LOW
- **Description:** Routes allowed any ticket reader to hit status/close endpoints. Service-layer checks still required manage or comment, so this was not a confirmed privilege bypass, but the route was looser than the rule.
- **Current state:** **FIXED.** Routes now require `support.ticket.manage` **or** `support.ticket.comment`.
- **Verification status:** VERIFIED by route change; existing Step 30 service tests remain.

### S33-F08 — Edge operator `innerHTML` concatenation

- **Area:** Edge local console
- **Severity:** LOW
- **Description:** Local operator status used `innerHTML` with unescaped values. The console is not the customer web app; values come from local gateway status.
- **Current state:** **FIXED** with HTML escaping.
- **Verification status:** VERIFIED in source. Browser XSS **NOT VERIFIED**.

### S33-F09 — Demo and development credentials

- **Area:** Secrets
- **Severity:** INFORMATIONAL
- **Description:** Seed publishes a local demo password. Example env files contain placeholders. Local ignored `.env` files may hold real credentials (**Potential hard-coded secret detected** — files were not copied into this report).
- **Current state:** Accepted for local demo. Must be replaced before any shared/production environment.
- **Verification status:** REQUIRES CONFIGURATION.

### S33-F10 — Org-wide roles and vehicle site model

- **Area:** Multi-tenancy
- **Severity:** MEDIUM (design)
- **Description:** Role assignments with `site = null` are organization-wide. Vehicles have no site FK. Seeded demo users therefore do not exercise the strictest site isolation.
- **Current state:** Existing architecture. Documented, not changed.
- **Verification status:** VERIFIED by code inspection and prior Step 28 tests (site-scoped users).

### S33-F11 — In-process rate limits and no WAF/SIEM

- **Area:** Operations
- **Severity:** INFORMATIONAL
- **Description:** Rate-limit counters reset on process restart and are not shared across nodes. No WAF, SIEM, or centralized log shipping in this repository.
- **Current state:** Application controls only.
- **Verification status:** REQUIRES EXTERNAL VALIDATION / REQUIRES CONFIGURATION.

### S33-F12 — No user-admin, password reset, or MFA

- **Area:** Authentication
- **Severity:** INFORMATIONAL
- **Description:** Permissions exist for `user.manage`; there is no HTTP user-administration API. Password reset, MFA, and SSO are absent. MFA is a future enhancement.
- **Current state:** Not implemented.
- **Verification status:** VERIFIED absent.

### S33-F13 — Billing / payment data

- **Area:** Billing
- **Severity:** INFORMATIONAL
- **Description:** No billing or payment module exists. No card data is stored by this application.
- **Current state:** Not applicable.
- **Verification status:** VERIFIED absent. Payment compliance is **NOT APPLICABLE**.

### S33-F14 — Backup/restore in production

- **Area:** Recovery
- **Severity:** INFORMATIONAL
- **Description:** Optional `pg_dump` exists. No restore API. This review did not restore a production database.
- **Current state:** See `docs/backup-recovery.md`.
- **Verification status:** NOT VERIFIED for production backup/restore.

### S33-F15 — Physical / hardware security

- **Area:** Weighbridge / cameras / edge
- **Severity:** INFORMATIONAL
- **Description:** Application adapters do not prove cabinet locks, network segmentation, firmware integrity, or tamper evidence.
- **Current state:** Documented as remaining site requirements.
- **Verification status:** REQUIRES EXTERNAL VALIDATION.

### S33-F16 — Transitive `deepmerge-ts` advisory in Prisma

- **Area:** Dependencies
- **Severity:** HIGH (advisory; not confirmed exploitable in this application)
- **Description:** `pnpm audit` reported GHSA-ggr8-5vv4-36mx: stack exhaustion in `deepmerge-ts` `<8.0.0` when merging recursive object graphs. Path: `apps/api` → `prisma` → `@prisma/config` → `deepmerge-ts`. This is Prisma CLI/config tooling, not application request handlers. A major Prisma upgrade was not applied in this step.
- **Evidence:** `corepack pnpm audit` on 2026-09-21 (exit 1, 1 high).
- **Current state:** Documented. No blind major upgrade.
- **Verification status:** VERIFIED that the advisory is present in the lockfile. Runtime exploitability **NOT VERIFIED**. Fix **REQUIRES EXTERNAL VALIDATION** / Prisma upgrade planning.

## Blockers

No **BLOCKER** (authentication bypass, cross-tenant data exposure in tested paths, hardcoded production secrets in git-tracked source, unauthorized completed-weight overwrite API, or RCE) was confirmed in this review.

Unresolved production blockers: **none confirmed in application source**. Deployment still **REQUIRES CONFIGURATION** (JWT, CORS, HTTPS, credentials, backups) and **REQUIRES EXTERNAL VALIDATION** (penetration test, dependency CVE triage at deploy time, infrastructure hardening).

## Practical fixes in this step

1. Omit document `storageKey` from public JSON.
2. Tighten webhook host validation and production DNS checks.
3. Redact integration secret prefixes in logs.
4. Optional `INTEGRATION_ENCRYPTION_KEY`.
5. Honor `JWT_EXPIRES_IN` with a production maximum.
6. Report and upload rate limits.
7. Ticket status/close permission alignment.
8. Escape Edge operator HTML.
9. Disable Vite production source maps.
10. Automated Step 33 security tests and documentation.
