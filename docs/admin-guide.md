# Administrator guide (Trinetra Systems V1.0)

For organization administrators and implementation engineers.

## Tenants

Each customer is an **Organization**. Sites, weighbridges, users, materials, and workflows belong to that organization. Cross-organization IDs return **404**. Unauthorized sites in the same org return **403**.

Do not use the seeded `demo` / `acme` / `frozen` / `archived` organizations as live customers.

## Users and roles

Permissions are assigned through roles. There is **no user-administration HTTP API** in V1.0. Users are created by:

- Development seed (demo only)
- Customer onboarding (implementation flow)
- Direct, controlled database operations by the operator (out of band)

Assign `UserRole.siteId` when site isolation is required. `site = null` is organization-wide.

## Onboarding

**Onboarding** walks materials, workflows, documents, unloading points, and a readiness checklist. Completing the wizard does not prove hardware.

## Configuration masters

- Vehicles, materials, workflows (Type 1/2/3 codes are yours to define)
- Unloading points and rules
- Devices, cameras, gateways, hardware pilot
- Integrations (API credentials shown once; webhook secrets shown once)

## Support and maintenance

Customer tickets are organization-scoped. Internal support notes stay off customer responses. Maintenance records require maintenance permissions and are audited.

## Integrations

`/api/v1/ext` uses hashed integration secrets. Scopes are least-privilege. Webhook delivery failure does not roll back a completed transaction.

## Reliability

**Recovery** shows optional `pg_dump` status and stale-work warnings. **Monitoring** shows in-process health. Configure PostgreSQL backups outside the app.

## Security

See `docs/security-controls.md`. Production: unique secrets, HTTPS, no demo password, no development Edge token.
