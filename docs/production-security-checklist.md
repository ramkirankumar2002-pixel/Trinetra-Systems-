# Production security checklist (Step 33)

Statuses: **VERIFIED**, **FIXED**, **NOT VERIFIED**, **REQUIRES CONFIGURATION**, **REQUIRES EXTERNAL VALIDATION**, **NOT APPLICABLE**.

Do not treat VERIFIED as “ready for every live site.” Infrastructure and operations remain the operator’s responsibility.

| Item | Status | Evidence | Owner | Remaining action |
| --- | --- | --- | --- | --- |
| Passwords hashed (bcrypt 12) | VERIFIED | `apps/api/src/lib/password.ts`; tests | Engineering | None in app |
| Generic login failures | VERIFIED | Auth service + Step 19/33 tests | Engineering | None in app |
| Session cookie httpOnly / Secure in production | VERIFIED | `session.ts` | Engineering | Enable HTTPS |
| Logout revokes session | VERIFIED | Auth service | Engineering | None in app |
| Production JWT secret enforced | VERIFIED | `index.ts` startup checks | Operator | Set unique ≥32 char `JWT_SECRET` |
| `JWT_EXPIRES_IN` honored, max 7 days in production | FIXED | `security.ts`, `session.ts` | Operator | Confirm duration |
| MFA | NOT APPLICABLE | Not implemented | Product | Future enhancement |
| Password reset / SSO | NOT APPLICABLE | Not implemented | Product | Future enhancement |
| Protected APIs require auth | VERIFIED | Router `use(requireAuthentication)`; Step 33 HTTP tests | Engineering | None in app |
| Cross-organization isolation | VERIFIED | Step 28 + Step 32 tests | Engineering | Assign site-scoped roles in production |
| Cross-site isolation for site-scoped users | VERIFIED | Step 28 tests | Operator | Do not seed org-wide roles if isolation is required |
| IDOR on documents/tickets | VERIFIED | Org filter 404; Step 30/28 tests | Engineering | None in app |
| Integration scopes / revoked / expired keys | VERIFIED | Step 32 tests | Engineering | Issue least-privilege scopes |
| Webhook signing | VERIFIED | Domain tests | Consumer | Verify HMAC + timestamp freshness |
| Webhook SSRF host checks | FIXED | `webhookUrl.ts` + delivery DNS | Engineering | Pentest DNS rebinding |
| Document `storageKey` omitted | FIXED | Mapper + Step 33 test | Engineering | None in app |
| File type/size/path checks | VERIFIED | `documentFile.ts`; Step 6/33 tests | Engineering | Antivirus **REQUIRES EXTERNAL VALIDATION** |
| Security headers | VERIFIED | `securityHeaders.ts`; Step 19 test | Operator | Frontend CSP at reverse proxy |
| CORS not `*` in production | VERIFIED | Startup check | Operator | Set explicit origins |
| Error bodies without stacks | VERIFIED | `app.ts`; tests | Engineering | None in app |
| Secret log redaction (incl. `tsk_`/`whsec_`) | FIXED | `logger.ts`; Step 33 test | Engineering | None in app |
| `.env` gitignored | VERIFIED | `.gitignore` | Operator | Rotate any local secrets if the tree was copied |
| Demo password unused in production | REQUIRES CONFIGURATION | Seed `demo-password` | Operator | Replace all demo users |
| `INTEGRATION_ENCRYPTION_KEY` | REQUIRES CONFIGURATION | `secrets.ts` | Operator | Set dedicated key before rotating JWT |
| Report/upload rate limits | FIXED | `resourceRateLimit.ts` | Engineering | Shared limiter if multi-node |
| Integration rate limits | VERIFIED | Integration middleware | Engineering | Shared limiter if multi-node |
| Audit not deletable via API | VERIFIED | No delete route; Step 19/33 | DBA | Protect DB access |
| Completed weights not silently editable | VERIFIED | `transactionMutability.ts` | Engineering | None in app |
| Billing / card data | NOT APPLICABLE | No billing module | — | Do not add card storage without a PCI program |
| Backup `pg_dump` optional | NOT VERIFIED | `docs/backup-recovery.md`; this review did not restore | Operator | WAL/PITR + tested restore |
| Restore procedure | NOT VERIFIED | Documented only | Operator | Test restore on a copy |
| Dependency vulnerabilities | REQUIRES EXTERNAL VALIDATION | `pnpm audit` 2026-09-21: 1 high (`deepmerge-ts` via Prisma `@prisma/config`, GHSA-ggr8-5vv4-36mx). Major Prisma upgrade not applied. | Operator | Triage with Prisma; re-run audit each release |
| Penetration test | REQUIRES EXTERNAL VALIDATION | Not performed | Security | Independent test |
| Physical hardware / network segmentation | REQUIRES EXTERNAL VALIDATION | Software cannot prove cabinets/firmware | Site | Locked cabinets, segmented OT network |
| HSTS | VERIFIED in API when production | Not enabled in local dev | Operator | Terminate TLS correctly |
| Vite production source maps off | FIXED | `apps/web/vite.config.ts` | Engineering | Keep off |
| NODE_ENV=production | REQUIRES CONFIGURATION | Startup + `simulationFlags` ignored in production | Operator | Set on deploy |
| DATABASE_URL production required | VERIFIED | Startup check | Operator | Least-privilege DB role |
