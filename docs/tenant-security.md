# Tenant security

**Status:** Step 28  
**Related:** [multi-tenant-architecture.md](./multi-tenant-architecture.md), [security.md](./security.md)

Cross-tenant access is rejected on the **server**. Changing `organizationId` or `siteId` in the query string cannot bypass this.

## Isolation rules

1. Every list/get query for operational data includes `organizationId: actor.user.organizationId`.
2. Missing records in another tenant return **404** (the row is not in this organization).
3. Same-organization site violations return **403**.
4. Untrusted `siteId` / `weighbridgeId` query or body values are resolved inside the caller's organization before use (`assertRequestedSite` / `requireRequestedTenantScope`). Organization-wide roles do not accept another tenant's identifiers.
5. Gateway ingest uses the **authenticated gateway's** organization and site. Claimed `organizationId` / `siteId` on the event must match or the event is rejected.
6. Offline / sync events keep gateway, organization, site, and device identity from registration, not from the client-supplied tenant fields.
7. Notifications are selected by `organizationId` + `recipientUserId`. Routing also requires `user.organizationId === event.organizationId`.
8. Audit logs are queried with `organizationId`. Organization administrators cannot read another organization's history.
9. Reports and CSV export use the same `report.read` permission, site scope, and weighbridge scope as the JSON report.
10. Search (`q` on transactions/vehicles/materials) always stays inside the caller's organization (and site, when assigned).

## Hardware and offline

A gateway registered to Organization A cannot attach events to Organization B. Device rows are loaded with `gatewayId` + `organizationId`. Suspended organizations cannot ingest new operational events.

## Demo isolation

The seeded `demo` organization has `kind=DEMO`. Isolated customer-like tenants (`acme`, `frozen`, `archived`) have `kind=CUSTOMER`. Demo users do not receive those organizations' ids in lists. Customer users do not see demo master data. There is no shared "global search" across kinds.

## Tests

`apps/api/test/step28-tenancy.test.ts` covers:

- Organization A user → Organization B transaction, vehicle, material, document, report, export, gateway, hardware
- Site A user → Site B transaction, report, hardware, site switch
- Archived organization login
- Suspended organization write
- Inactive site new transaction
- Weighbridge-specific role unit checks
- Gateway organization claim mismatch

## Performance

Existing indexes on `organizationId`, `(organizationId, siteId, arrivedAt)`, and related foreign keys are reused. This step adds:

- `Site (organizationId, status)`
- `UserRole (weighbridgeId)`

No unbounded cross-organization queries were introduced.
