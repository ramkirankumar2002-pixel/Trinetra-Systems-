# Trinetra Systems V1.0 release notes

**Product:** Trinetra Systems  
**Version:** 1.0.0 (V1.0)  
**Release type:** Controlled software freeze for a supervised site pilot  
**Not claimed:** Commercial production proof, customer success metrics, hardware accuracy, or compliance certification

## What V1.0 includes

Software for inbound weighbridge operations on a configured organization and site:

- Login, RBAC, multi-tenant organization/site isolation
- Vehicle, material, and configurable Type 1 / Type 2 / Type 3 workflows (organization labels, not industry standards)
- Document upload, simulated OCR, simulated ANPR
- Gross / tare / net, approvals, unloading, completion, dashboard, reports
- In-app notifications and operational alerts
- Driver mode (en / hi / te) with local voice prompts
- Edge Gateway simulator, offline queue, sync, weight anomaly inspection
- Support tickets, maintenance records, customer onboarding wizard
- Integration API (`/api/v1/ext`) and signed webhooks
- Application security controls reviewed in Step 33

## What V1.0 does not include

- Billing or payment-card processing
- MFA, SSO, or self-service password reset
- HTTP user-administration API
- Real manufacturer weighbridge/ANPR/OCR engines
- Email or SMS notifications
- Certified accessibility (WCAG) programme
- Independently verified disaster recovery

## Breaking notes for operators

- Set `NODE_ENV=production`, a unique ≥32 character `JWT_SECRET`, explicit `CORS_ORIGIN`, and `DATABASE_URL` before starting the API in production.
- Run `pnpm validate:config` (does not print secret values).
- Demo seed is blocked when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` on an isolated demo database.
- Simulated hardware results must stay labeled simulated.

## Upgrade from 0.0.1 development trees

Apply Prisma migrations in order (`prisma migrate deploy`). Do not reset customer databases. Replace demo users and the development Edge token.
