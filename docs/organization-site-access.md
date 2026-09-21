# Organization and site access

**Status:** Step 28  
**Related:** [multi-tenant-architecture.md](./multi-tenant-architecture.md), [tenant-security.md](./tenant-security.md)

## After login

The session user includes:

- Organization (`id`, `slug`, `name`, `status`, `kind`)
- Default / active site
- Departments
- Roles, including optional site and weighbridge
- Permissions from those roles

`GET /api/v1/auth/context` returns the operational context (accessible sites and weighbridges). The client cannot submit another organization's id. The JWT `org` claim must match the user's `organizationId` or the session is rejected.

Untrusted `siteId` and `weighbridgeId` values on APIs are checked with `requireRequestedTenantScope` (and the matching service helpers). Organization-wide administrators still cannot address another organization's site.

## Active site

The header shows **Current site**. Users with more than one accessible site may switch with `PATCH /api/v1/auth/context` `{ "siteId" }`.

- The server calls `assertSiteAccess` before updating `User.defaultSiteId`.
- Switching site does **not** grant extra permissions.
- The change is audited as `SITE_CONTEXT_CHANGED` (from/to site ids only).

## Who sees what

| Actor | Sites | Weighbridges | Reports / CSV |
| --- | --- | --- | --- |
| Organization `ADMIN` (role with `siteId` null) | All sites in that org | All weighbridges in that org | That organization only |
| Office / store / operator with `UserRole.siteId` | Assigned site(s) | Weighbridges on those sites | Same site restriction |
| Operator with `UserRole.weighbridgeId` | Parent site | That weighbridge only | Transactions for that weighbridge |
| User in Organization B | Never Organization A | Never | Never |

`SITE_USER` on Demo Site B has `dashboard.read` and `transaction.read` but not `report.read` or `user.read`.

## Admin UI

`/organization` (`user.read`) shows the caller's organization tree: sites, weighbridges, gateways, cameras, departments, users. It never lists other tenants.

`user.manage` (seeded on `ADMIN`) may set:

- Organization `ACTIVE` / `SUSPENDED`
- Site `ACTIVE` / `INACTIVE`

## APIs

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/auth/context` | authenticated |
| PATCH | `/api/v1/auth/context` | authenticated + site access |
| GET | `/api/v1/tenancy/directory` | `user.read` |
| PATCH | `/api/v1/tenancy/organization` | `user.manage` |
| PATCH | `/api/v1/tenancy/sites/:id` | `user.manage` |

Login may include optional `organizationSlug` when the same email exists in more than one organization. Email remains unique per organization, not globally.
