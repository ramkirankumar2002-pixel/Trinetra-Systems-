# Production-readiness checklist

Status values:

- **PASS** — verified in this Step 19 review of the current codebase or by running the listed check.
- **NEEDS ATTENTION** — partially present; operators must configure or complete it before a real site.
- **NOT IMPLEMENTED** — not present as an application capability.

Do not treat PASS as “safe for every deployment.” Environment, network, and operational controls still belong to the operator.

## Authentication

| Item | Status | Notes |
| --- | --- | --- |
| Passwords hashed (bcrypt, not plaintext) | PASS | `apps/api/src/lib/password.ts`, 12 rounds |
| Generic login failure message | PASS | Inactive and unknown accounts share one message |
| Session cookie httpOnly | PASS | `session.ts` |
| Secure cookie flag in production | PASS | `secure: isProduction()` |
| Logout revokes session | PASS | `RefreshToken.revokedAt` |
| Expired / invalid JWT rejected | PASS | `readAccessToken` + session row checks |
| Login rate limit | PASS | Email + IP, configurable |
| Production JWT secret enforced | PASS | Startup rejects empty / placeholder / short secrets when `NODE_ENV=production` |
| Password reset / MFA / SSO | NOT IMPLEMENTED | |

## Authorization

| Item | Status | Notes |
| --- | --- | --- |
| Protected API routes require authentication | PASS | Routers call `requireAuthentication` |
| Permission checks on writes | PASS | `requirePermission` + service checks |
| Organization scoping on get-by-id | PASS | Transactions, documents, approvals, alerts, anomalies, gateways |
| Site checks when the entity has a site | PASS | `assertSiteAccess` / `accessibleSiteIds` |
| IDOR blocked for other-organization IDs | PASS | Lookup includes `organizationId` (404) |
| Operational alert ACK/RESOLVE restricted | PASS | `security.acknowledge` |
| Seeded demo roles are org-wide | NEEDS ATTENTION | Assign `UserRole.siteId` in production if site isolation is required |
| User / role administration API | NOT IMPLEMENTED | Permissions exist; no HTTP module |

## Database

| Item | Status | Notes |
| --- | --- | --- |
| Prisma parameterized queries | PASS | No user-built `$queryRaw` found |
| Unique keys on login email per org, plates, references, edge events | PASS | Schema uniques reviewed |
| Related writes use transactions | PASS | Approvals, finalize, alerts, documents |
| Foreign keys | PASS | Prisma relations with restrict/set-null |
| Destructive schema change in this step | PASS | None |
| Automated backups / PITR | NOT IMPLEMENTED | Operator responsibility |

## API

| Item | Status | Notes |
| --- | --- | --- |
| CORS configured from environment | PASS | Default localhost; production rejects `*` |
| Body size limits | PASS | 1 MB JSON; larger edge ingest |
| Security headers | PASS | See `securityHeaders.ts` |
| Safe production error bodies | PASS | No stack / SQL / env in JSON |
| Request IDs | PASS | Header + error payload |
| Health endpoint unauthenticated | PASS | `/health` |
| Configuration mutation rate limits | PASS | Workflow / gateway / hardware config / anomaly config |
| In-process rate-limit store | NEEDS ATTENTION | Resets on process restart; use a proxy limiter if many nodes |

## File storage

| Item | Status | Notes |
| --- | --- | --- |
| Server-side type + size checks | PASS | Magic bytes, executable reject, `DOCUMENT_MAX_BYTES` |
| Path sanitization | PASS | `documentFile.ts` |
| Authz on download | PASS | Org + transaction site |
| Storage outside source tree | PASS | `readStorageDir` |
| Production object-storage / antivirus | NOT IMPLEMENTED | Local filesystem in this repo |

## Secrets

| Item | Status | Notes |
| --- | --- | --- |
| `.env` gitignored | PASS | `.gitignore` |
| Example env files are placeholders | PASS | `apps/api/.env.example` |
| Secrets not returned by `/auth/login` or `/auth/me` | PASS | Public user only |
| Local ignored `.env` may hold real credentials | NEEDS ATTENTION | Potential hard-coded secret detected. Rotate if this tree is copied. |
| Demo password published for local accounts | NEEDS ATTENTION | Replace before any shared environment |

## Logging

| Item | Status | Notes |
| --- | --- | --- |
| Structured JSON logger with redaction | PASS | `lib/logger.ts` |
| Request id / user / transaction in domain audits | PASS | Audit metadata + request id on errors |
| Central log shipping / SIEM | NOT IMPLEMENTED | |

## Audit

| Item | Status | Notes |
| --- | --- | --- |
| Login / logout / failed login recorded | PASS | `AUDIT_ACTIONS.LOGIN_*` |
| Workflow and hardware actions recorded | PASS | Existing audit catalog |
| No delete-audit API | PASS | Dashboard list is read-only |
| Tamper-evident / append-only storage | NOT IMPLEMENTED | Database row; protect DB access |

## Offline synchronization

| Item | Status | Notes |
| --- | --- | --- |
| Unique event IDs | PASS | `EdgeIngestedEvent.eventId` is the primary key |
| Duplicate ingest rejected / replayed safely | PASS | Existing ingest + audit `EDGE_EVENT_DUPLICATE` |
| Sync requires gateway auth | PASS | `requireGatewayAuth` |
| Server re-validates payloads | PASS | Envelope + site/org/gateway bind |
| Dead letters retained | PASS | `EdgeDeadLetter` |

## Edge Gateway

| Item | Status | Notes |
| --- | --- | --- |
| Per-gateway hashed credential | PASS | SHA-256 of `tgw_…` |
| Impersonation by swapping gateway id rejected | PASS | Credential bind + envelope check |
| Heartbeat / bootstrap / events authenticated | PASS | |
| Mutual TLS | NOT IMPLEMENTED | Type-level extension point only |
| Development simulator credential | NEEDS ATTENTION | Never enable in production |

## Hardware integration

| Item | Status | Notes |
| --- | --- | --- |
| Simulator vs manual vs device sources exist | PASS | Weighment source enum / providers |
| Live weight and tests are authenticated | PASS | Permission-gated |
| Legal-for-trade certification | NOT IMPLEMENTED | Out of scope |
| Production adapters for a specific scale vendor | NEEDS ATTENTION | Manufacturer adapters are placeholders |

## Backups

| Item | Status | Notes |
| --- | --- | --- |
| Application-managed backup job | NOT IMPLEMENTED | Use PostgreSQL + filesystem backups |
| Restore drill | NOT IMPLEMENTED | |

## Monitoring

| Item | Status | Notes |
| --- | --- | --- |
| Process logs for runtime start failures | PASS | Structured error events |
| Uptime / metrics / alerting product | NOT IMPLEMENTED | `/health` only |

## Error handling

| Item | Status | Notes |
| --- | --- | --- |
| HttpError → status + safe message | PASS | |
| Prisma outage → 503 | PASS | |
| Unhandled → 500 without stack in body | PASS | |
| Driver Mode uses simplified client messages | PASS | Existing Driver Mode mapping |

## Testing

| Item | Status | Notes |
| --- | --- | --- |
| Domain / API unit tests for Steps 5–18 | PASS | Existing `apps/api/test/step*.test.ts` |
| Step 19 security tests | PASS | `apps/api/test/step19-security-hardening.test.ts` |
| Frontend unit tests | PASS | Existing web tests (Driver Mode / i18n) |
| Full live browser regression of every Step 1–18 screen in this pass | NEEDS ATTENTION | Covered by automated tests; operators should still smoke-test a demo site |

## Deployment

| Item | Status | Notes |
| --- | --- | --- |
| `NODE_ENV` distinguishes production | PASS | Cookie secure, HSTS, JWT/CORS guards |
| Container / CI deploy pipeline in this repo | NOT IMPLEMENTED | |
| HTTPS termination | NOT IMPLEMENTED | Expect a reverse proxy |
| Multi-instance session/rate-limit store | NOT IMPLEMENTED | Sticky or shared store required if scaled out |

## Monitoring (Step 21)

| Item | Status | Notes |
| --- | --- | --- |
| Structured logs with redaction | PASS | DEBUG/INFO/WARN/ERROR; secrets redacted |
| Request correlation IDs | PASS | `X-Request-Id` aliased as correlation ID |
| Process health live/ready | PASS | Ready requires PostgreSQL |
| In-memory metrics | PASS | Not historical production monitoring |
| Monitoring dashboard + RBAC | PASS | `monitoring.read`; drivers excluded |
| Prometheus / OpenTelemetry / Grafana | NOT IMPLEMENTED | Extension point only |

## Overall

The application has a coherent authn/authz, audit, and validation baseline suitable for a controlled pilot after secrets, demo accounts, TLS, backups, and site-scoped role assignments are handled by operators.

It is **not** production-complete for internet exposure, legal-for-trade metrology, or multi-tenant SaaS isolation.
