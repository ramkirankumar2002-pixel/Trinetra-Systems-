# Trinetra Systems security model

This describes the security controls that exist after Step 19. It does not claim the platform is 100% secure.

## Authentication model

- Users authenticate with email + password against PostgreSQL via Prisma.
- Passwords are hashed with bcrypt (12 rounds). Plaintext passwords are never stored or returned.
- A successful login creates a `RefreshToken` row (session) and a JWT whose `jti` is that session id.
- The JWT is sent only as an httpOnly cookie (`trinetra_session` by default). The login JSON returns the public user, not the token.
- Cookie flags: `httpOnly`, `sameSite=lax`, `secure` in production, path `/`.
- `/api/v1/auth/me` and all protected routes require a valid, unrevoked, unexpired session and an active user.
- Logout revokes the session row and clears the cookie.
- Invalid or expired tokens produce `401 Not authenticated`.
- Login failures use a single message: `Invalid email or password`.
- Login is rate-limited per email + IP.

## Authorization model

Authorization is enforced in the API. Frontend route hiding is not trusted.

Typical stack:

1. `requireAuthentication`
2. `requirePermission(...)` (OR of permission codes)
3. Service-layer organization filter
4. `assertSiteAccess` / `accessibleSiteIds` when the entity has a site

Admins receive every permission through seed role grants, not through a hidden middleware bypass except department checks, which allow ADMIN.

## RBAC

Seeded roles and the permissions they are intended to use:

| Role | Typical allowed actions | Forbidden / out of scope | Site / department notes |
| --- | --- | --- | --- |
| ADMIN | All seeded permissions | None in the permission catalog | Org-wide in the demo seed |
| OFFICE_MANAGER | Reports, audit read, materials/workflows, hardware/gateway/sync/anomaly configuration | Weighment recording, approvals, unloading, alert ACK without `security.acknowledge` | Org-wide in the demo seed |
| SUPERVISOR | Approvals, unloading, finalize, audit, security ACK, anomaly resolve, hardware | User administration UI (no API yet) | Org-wide in the demo seed |
| WEIGHBRIDGE_OPERATOR | Vehicle/transaction/weighment/documents/unloading/finalize, Driver Mode, anomaly ACK | Approvals, audit, security ACK, hardware config, workflow manage | Weighbridge department |
| STORE_OFFICER | Approvals, document verify, unloading, dashboard | Weighment record, finalize, security ACK | Store department |
| LAB_USER | Approvals and document verify | Weighment, unloading, security | Lab department |
| PLANT_USER | Unloading manage, anomaly read | Approvals, weighment, security ACK | Plant department |
| SITE_USER | Transaction and dashboard read | Writes, approvals, security ACK | Site department |
| SECURITY_USER | Security read/ACK, anomaly read/ACK, dashboard | Anomaly resolve, weighment, workflow | Security review |
| EDGE_SERVICE | Gateway-bound ingest of weighments/transactions | Interactive UI | Used by the Edge Gateway actor |
| DRIVER | Transaction read only | Driver Mode (`driver.mode` is on operator/supervisor) | Not a weighbridge console |

Driver / operator mode is a UI plus `GET /api/v1/driver/context` and `POST /api/v1/driver/events`. It reuses the existing workflow. It cannot approve.

## Site and department isolation

- Transactions, documents, approvals, unloading, alerts, anomalies, and gateways are loaded with `organizationId` plus site checks.
- Notifications are owned by `recipientUserId` inside the organization.
- Vehicles and materials are organization-scoped.
- A role assignment with `site = null` is treated as organization-wide. Demo seed roles are org-wide.
- Department middleware is used for a few access probes. Approval eligibility also checks department and `approval.decide`.

Changing an ID in the URL is not enough: missing rows return 404 inside the caller’s organization; other-site rows return 403 when the caller is actually site-scoped.

## API security

- CORS origins come from `CORS_ORIGIN` (comma-separated). Production refuses `*` or an empty list.
- JSON body limit is 1 MB. Edge ingest uses `EDGE_INGEST_MAX_BYTES`.
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, API CSP `default-src 'none'`, `Cache-Control: no-store`, HSTS in production.
- `X-Powered-By` is disabled.
- `X-Request-Id` is generated or accepted when it matches a strict charset.
- Login and selected configuration writes are rate-limited. Weighment, live weight, heartbeat, and edge event ingest are not placed on the configuration limiter.
- Production responses do not include stack traces, SQL, file paths, or environment values.

## Document security

- Allowed types: PDF, JPEG, PNG, WEBP (magic-byte sniff + declared MIME).
- Executable extensions are rejected.
- Size is capped by `DOCUMENT_MAX_BYTES`.
- Original names are sanitized; storage keys cannot follow user paths.
- Storage cannot be placed under `src/`.
- Download requires authentication, `transaction.read`, organization match, and site access.
- Files are served as attachments with `nosniff` and `Cache-Control: private, no-store`.

## Offline security

- Offline / edge events require a unique `eventId`.
- Duplicates return the stored result; they are not re-applied.
- The API re-validates payload, device, site, and organization.
- Dead-letter events are retained. They are not silently deleted.
- Sync and ingest require gateway authentication. Browser users cannot post as an arbitrary gateway.
- Local edge storage must not hold user JWT secrets; gateway credentials stay in Edge environment configuration.

## Edge Gateway security

- Each gateway has a code, site, organization, and hashed credential.
- Authentication looks up `credentialHash`. The caller cannot impersonate another gateway by sending its id.
- Heartbeat, bootstrap, and event ingest use the authenticated gateway record.
- Claimed `gatewayId` / `organizationId` / `siteId` values that do not match the credential are rejected.
- Current method: `SHARED_CREDENTIAL` (`tgw_` + random secret, stored as SHA-256).
- Future extension point: `MUTUAL_TLS` / `FutureMutualTlsGatewayIdentity` in `edgeCredentials.ts`. Certificate infrastructure is not implemented.

## Audit logging

Important actions write `AuditLog` rows with actor, action, entity type/id, timestamp, IP, user agent, and metadata.

Covered in this step or earlier: login success/failure, logout, vehicles, transactions, weighments, documents, materials, workflows, approvals, notifications, operational alerts, unloading, finalization, hardware/camera/gateway changes, anomalies, offline sync, Driver Mode actions.

There is no “delete audit log” API. Listing requires `audit.read`.

## Security event lifecycle

Weight anomalies and related `SecurityEvent` rows use:

- `OPEN`
- `ACKNOWLEDGED`
- `RESOLVED`
- `FALSE_POSITIVE`

Transitions are validated. ACK records who and when. Resolve / false-positive record who and when on the anomaly event. Unauthorized callers receive 403.

Operational alerts use `OPEN → ACKNOWLEDGED → RESOLVED` (no false-positive state). Writes require `security.acknowledge`.

An anomaly is an observation, not a fraud verdict.

## Secret management

- Runtime secrets come from environment variables.
- `.env` is gitignored. Example files contain placeholders only.
- Production requires a long random `JWT_SECRET`, an explicit `CORS_ORIGIN`, and `DATABASE_URL`.
- Do not log passwords, tokens, gateway credentials, or document bytes.
- Structured logs redact common secret field names and JWT-like / bcrypt / `tgw_` strings.

## Production security checklist (summary)

Before any real site:

1. Set a unique `JWT_SECRET` of at least 32 characters.
2. Set `NODE_ENV=production`.
3. Set a concrete `CORS_ORIGIN` (never `*`).
4. Use a dedicated PostgreSQL role and rotate `DATABASE_URL`.
5. Enable HTTPS and consider `TRUST_PROXY=true` only behind a trusted proxy.
6. Replace every demo user and the published demo password.
7. Issue unique gateway credentials; never reuse the development Edge secret.
8. Restrict document and ANPR storage directories and backups.
9. Confirm audit listing works and that no one can delete audit rows through the API.
10. Run the automated security and workflow tests.

Full status: `docs/production-readiness-checklist.md`.

## Known limitations

- This is not a formal third-party audit or infrastructure hardening guide.
- Demo roles are organization-wide, so site isolation is weaker in the seeded database than a production assignment model.
- Vehicles are not site-scoped.
- There is no user-administration API, password-reset API, or SSO.
- Sessions are single JWT + refresh-token row, not rotating refresh tokens.
- Mutual TLS for gateways is not implemented.
- SecurityEvent rows do not store a resolved-by user; WeightAnomalyEvent does.
- Email is unique per organization, not globally.
- Rate limits are in-process memory and reset on restart.
- There is no WAF, SIEM, or centralized backup/restore automation in this repository.
- Simulated weighbridge, ANPR, OCR, and voice providers are development aids. They must be disabled or replaced before treating readings as legal-for-trade evidence.
- The system does not prove fraud, tampering, or theft.
