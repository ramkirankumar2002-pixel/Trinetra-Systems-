# Integration & API platform

Trinetra exposes a controlled integration layer so authorized external systems can exchange data without receiving a database dump or a vendor-specific ERP connector.

This is the foundation only. There is no SAP, Oracle, Tally, Zoho, Dynamics, payment, CRM, or GraphQL surface.

## Architecture

- Session users manage integrations at `/api/v1/integrations` (cookie JWT, existing RBAC).
- External systems call `/api/v1/ext/...` with an integration secret (`Authorization: Bearer` or `X-Trinetra-Api-Key`).
- Existing session APIs stay at `/api/v1/...` and are unchanged for the frontend.
- Business events are written to an outbox in the same database transaction as `writeAudit`. Webhook HTTP delivery runs asynchronously and cannot roll back a completed transaction.

```text
External ERP
  → /api/v1/ext (credential auth, scopes, rate limit, request log)
  → existing services (vehicles, transactions mapper, reports, documents)
  → PostgreSQL
  → audit log + integration outbox
  → webhook worker (HMAC-signed POST)
```

## Authentication

Integration secrets use prefixes `tsk_test_` (TEST) or `tsk_live_` (PRODUCTION). Only a SHA-256 hash is stored. The plaintext secret is returned once on create or rotate.

Webhook signing secrets use prefix `whsec_` and are stored encrypted (AES-256-GCM). They are required in plaintext to compute HMAC signatures.

Revoked or expired credentials receive `401`. Suspended applications may still `GET`. Revoked applications are rejected.

## Permissions

Session UI/API:

- `integration.read` — overview, applications, credentials metadata, webhooks, deliveries, usage
- `integration.manage` — create/update applications, credentials, webhooks, mappings

Assigned to Administrator, Office Manager, Supervisor, and Implementation Engineer. Operators do not receive these permissions.

External scopes are granted per application. New applications default to `ORGANIZATION_READ` only. Server-side `requireIntegrationScope` enforces them. Mapped internal permissions exist only so reused services can authorize the synthetic integration actor.

Write APIs currently allowed:

- Create/update vehicles (`VEHICLES_WRITE`) through existing vehicle rules
- Create external references (`TRANSACTIONS_WRITE` / `VEHICLES_WRITE`)

Write APIs explicitly refused:

- Document upload
- Changing completed weights, approvals, workflows, audit, RBAC, billing, or system configuration
- Creating transactions or recording weighments

## Tenant isolation

Every integration belongs to one organization. Lookups always include `organizationId`. Other-organization identifiers return `404`. Application `siteIds`, when set, restrict the synthetic actor to those sites. Empty `siteIds` means organization-wide access for that integration.

## Rate limiting

Defaults: 60 requests/minute and 1200 requests/hour per credential, configurable per application. These are conservative development defaults, not a commercial SLA. Exceeding the limit returns `429` with `RATE_LIMITED`. Counters are in-memory per API process.

## Request logging

`IntegrationRequestLog` stores method, path, status, duration, request id, and rate-limit flag. It does not store secrets, authorization headers, or document contents.

## Idempotency

`Idempotency-Key` on `POST /api/v1/ext/vehicles`, `PATCH /api/v1/ext/vehicles/:id`, and `POST /api/v1/ext/references`. Unique per organization + application + endpoint. Same key and fingerprint replays the stored response. Same key with a different body returns `409`.

## External references

Stored separately from Trinetra identifiers. Unique per organization + application + external type + external id. They never overwrite `referenceNumber` or other authoritative keys.

## Field mapping

`IntegrationFieldMapping` stores `externalField → trinetraField` with a documented Trinetra target list. There is no visual mapping editor and no vendor field catalog in this step.

## Current supported external endpoints

| Method | Path | Scope |
| --- | --- | --- |
| GET | `/api/v1/ext/organization` | ORGANIZATION_READ |
| GET | `/api/v1/ext/sites` | ORGANIZATION_READ |
| GET | `/api/v1/ext/transactions` | TRANSACTIONS_READ |
| GET | `/api/v1/ext/transactions/:id` | TRANSACTIONS_READ |
| GET | `/api/v1/ext/weighments` | WEIGHMENTS_READ or TRANSACTIONS_READ |
| GET | `/api/v1/ext/vehicles` | VEHICLES_READ |
| POST | `/api/v1/ext/vehicles` | VEHICLES_WRITE |
| PATCH | `/api/v1/ext/vehicles/:id` | VEHICLES_WRITE |
| GET | `/api/v1/ext/materials` | MATERIALS_READ |
| GET | `/api/v1/ext/weighbridges` | WEIGHBRIDGES_READ |
| GET | `/api/v1/ext/devices` | DEVICES_READ |
| GET | `/api/v1/ext/events` | EVENTS_READ |
| GET | `/api/v1/ext/documents` | DOCUMENTS_READ |
| GET | `/api/v1/ext/documents/:id/file` | DOCUMENTS_READ |
| GET | `/api/v1/ext/reports/transactions` | REPORTS_READ |
| GET | `/api/v1/ext/notifications` | NOTIFICATIONS_READ |
| GET/POST | `/api/v1/ext/references` | read/write scopes as above |

Document metadata omits `storageKey` and OCR `rawText`. File download streams bytes through the existing document storage service.

Transaction GET on `/api/v1/ext` does **not** call the session `getTransaction` helper (that helper emits approval side effects).

## Pagination and sync

Page/pageSize with a maximum of 100 on integration list endpoints. `updatedSince` is an ISO-8601 UTC timestamp compared to `updatedAt` (transactions/documents) or `recordedAt`/`occurredAt` for weighments and events. Responses include `"timezone": "UTC"`. Unbounded dumps are not supported.

## Errors

External errors use:

```json
{
  "error": { "code": "AUTHENTICATION_FAILED", "message": "..." },
  "requestId": "...",
  "correlationId": "..."
}
```

Codes: AUTHENTICATION_FAILED, FORBIDDEN, INVALID_REQUEST, RESOURCE_NOT_FOUND, CONFLICT, RATE_LIMITED, VALIDATION_FAILED, INTERNAL_ERROR. Stack traces and Prisma codes are not returned.

Session APIs keep the existing `{ error, requestId, correlationId, referenceId }` shape.

## Current limitations

- Rate limits are per process, not clustered.
- Webhook worker is an in-process interval (5s default).
- Private/loopback webhook URLs are allowed outside production for tests; production requires HTTPS and rejects private targets.
- No billing module exists, so billing records cannot be exposed or changed.
- No specific ERP field pack or visual mapper.
- Document write is intentionally unavailable.
- Mapping application to inbound payloads is not automatic.

## Future ERP approach

A later vendor adapter should:

1. Create a TEST integration with the minimum scopes.
2. Store field mappings for that application.
3. Translate vendor payloads using those mappings.
4. Attach external references instead of overwriting Trinetra IDs.
5. Subscribe to webhooks instead of polling all history.

See also [api-versioning.md](./api-versioning.md) and [webhooks.md](./webhooks.md).
