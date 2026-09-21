# Customer deployment checklist (Trinetra Systems V1.0)

Use this on a supervised pilot. Check items only when they are actually done. Simulated hardware is not a substitute for the hardware section.

## Pre-deployment

- [ ] Organization created (not the development `demo` tenant)
- [ ] Site created with timezone
- [ ] Users created with least-privilege roles
- [ ] Site-scoped roles assigned where isolation is required
- [ ] Materials configured
- [ ] Workflows configured (Type 1/2/3 as **this customer’s** codes)
- [ ] Document types configured
- [ ] Unloading points configured
- [ ] Notification recipients understood (in-app only in V1.0)

## Hardware

- [ ] Weighing indicator identified (manufacturer / model)
- [ ] Protocol confirmed and documented
- [ ] Camera identified
- [ ] Scanner identified (if used)
- [ ] Edge Gateway installed on the site network
- [ ] Unique gateway credential issued (not `tgw_devonly_...`)
- [ ] Network verified (OT vs office vs internet)
- [ ] Physical cabinets / access control (site responsibility)

## Software

- [ ] `NODE_ENV=production`
- [ ] `pnpm validate:config` shows no **ERROR**
- [ ] Database migrated (`prisma migrate deploy`)
- [ ] Demo seed **not** applied
- [ ] Backup configured (operator PostgreSQL backups; app `pg_dump` optional)
- [ ] Monitoring/log shipping configured
- [ ] Step 33 security review read; pentest scheduled if required by the customer
- [ ] HTTPS reverse proxy and explicit `CORS_ORIGIN`
- [ ] `INTEGRATION_ENCRYPTION_KEY` set if webhooks are used

## Testing on the target site

- [ ] Test transaction (clearly marked test)
- [ ] Type 1 path
- [ ] Type 2 path
- [ ] Type 3 path
- [ ] Approval allow and reject
- [ ] Gross, tare, net
- [ ] Offline / recovery if Edge is in scope
- [ ] Anomaly handling (inspection language)
- [ ] Unauthorized user blocked
- [ ] Cross-organization ID returns 404

## Go-live

- [ ] Operator training (`docs/operator-guide.md`)
- [ ] Support contact (`docs/customer-support.md`)
- [ ] Maintenance procedure
- [ ] Rollback plan (restore from tested PostgreSQL backup)
- [ ] Acceptance sign-off that distinguishes software from hardware

Rollback: restore PostgreSQL from a **tested** backup. This repository did not verify a production restore.
