# Data privacy review (Step 33)

**This is a technical privacy review, not legal advice.**

It does not claim GDPR, DPDP Act, or any other privacy law compliance. Retention that is not implemented in software is marked **REQUIRES ORGANIZATION POLICY**.

## Categories

### User identity

- **Why stored:** Login, RBAC, audit actor, support assignment.
- **Where:** PostgreSQL `User`, `UserRole`, `RefreshToken`.
- **Who can access:** Users in the same organization with `user.read` (organization page). Password hashes are never returned on APIs. There is no user-admin HTTP API.
- **Retention:** Sessions expire (`JWT_EXPIRES_IN`, default 8h). User rows persist until operators change the database.
- **Deletion/archive:** No self-service deletion API. **REQUIRES ORGANIZATION POLICY**.

### Driver information

- **Why stored:** Weighbridge identification and document comparison where used.
- **Where:** Transaction / document extracted fields; driver mode preferences in browser `localStorage` (language/voice only, not credentials).
- **Who can access:** Transaction and document permissions inside the organization/site.
- **Retention / deletion:** **REQUIRES ORGANIZATION POLICY**.

### Vehicle information

- **Why stored:** Master data for inbound identification.
- **Where:** `Vehicle` (organization-scoped, not site-scoped).
- **Who can access:** `vehicle.read` / `vehicle.manage` in the organization; integration `VEHICLES_READ` / `VEHICLES_WRITE`.
- **Retention / deletion:** Soft deactivation exists; purge **REQUIRES ORGANIZATION POLICY**.

### Supplier information

- **Why stored:** Material inbound documentation.
- **Where:** `Supplier` and document OCR fields.
- **Who can access:** `supplier.read` / related transaction permissions.
- **Retention / deletion:** **REQUIRES ORGANIZATION POLICY**.

### Documents

- **Why stored:** Proof of delivery / invoice / gate pass attached to a transaction.
- **Where:** PostgreSQL metadata + files under `DOCUMENT_STORAGE_DIR` (local filesystem in this repo).
- **Who can access:** Authenticated users with `transaction.read` (and upload/verify permissions for writes) after org and site checks. Integration `DOCUMENTS_READ` can list metadata and download via authorized file route; `DOCUMENTS_WRITE` is not enabled.
- **Retention:** ANPR evidence has `ANPR_EVIDENCE_RETENTION_DAYS`. Business documents do not auto-delete.
- **Deletion/archive:** No customer purge API. **REQUIRES ORGANIZATION POLICY**.

### Transaction and weight data

- **Why stored:** Operational weighbridge workflow and net weight calculation.
- **Where:** `Transaction`, `Weighment` (decimal kg), workflow snapshot.
- **Who can access:** `transaction.read` and related write permissions; integration read scopes. Completed weights cannot be silently overwritten.
- **Retention / deletion:** **REQUIRES ORGANIZATION POLICY**. Historical operational records must not be auto-deleted by this application.

### Audit records

- **Why stored:** Reconstruct who changed what.
- **Where:** `AuditLog`.
- **Who can access:** `audit.read` in the same organization. No HTTP delete/update.
- **Retention:** **REQUIRES ORGANIZATION POLICY**. Database administrators can still modify rows; append-only storage is **NOT IMPLEMENTED**.

### Security events / weight anomalies

- **Why stored:** Inspection of measurement anomalies. These are observations, not legal determinations of fraud.
- **Where:** `SecurityEvent`, `WeightAnomalyEvent`.
- **Who can access:** `anomaly.read` / `security.read` and acknowledge/resolve permissions.
- **Retention:** **REQUIRES ORGANIZATION POLICY**. Ordinary users cannot delete events through the API.

### Support information

- **Why stored:** Customer tickets and service history.
- **Where:** `SupportTicket`, `SupportTicketActivity`, `ServiceMaintenanceRecord`.
- **Who can access:** Organization-scoped `support.*` permissions. Internal notes (`visibility=INTERNAL`) are hidden unless `support.internal`.
- **Retention:** **REQUIRES ORGANIZATION POLICY**.

### Integration data

- **Why stored:** External system access, webhook delivery, idempotency, external references.
- **Where:** Integration application/credential/webhook/outbox/delivery/request-log tables.
- **Who can access:** `integration.read` / `integration.manage` in the organization. Secrets are hashed or encrypted; plaintext shown once.
- **Retention:** Request logs and deliveries accrue without an automated purge. **REQUIRES ORGANIZATION POLICY**.

### Notifications

- **Why stored:** In-app operational alerts.
- **Where:** `Notification`, `OperationalAlert`.
- **Who can access:** Recipient user and `security.acknowledge` for alert writes.
- **Retention:** **REQUIRES ORGANIZATION POLICY**.

### Billing

- **Why stored:** Not stored. There is no billing or payment-card module.
- **Where / who:** Not applicable.

### Edge / offline local data

- **Why stored:** Continue weighbridge work without WAN.
- **Where:** Edge process local store (`apps/edge/data/`, gitignored). Must not hold user JWT secrets; gateway credentials stay in Edge environment configuration.
- **Who can access:** Operators on that machine.
- **Retention:** Queue/dead-letter until sync. **REQUIRES ORGANIZATION POLICY** for disk disposal.

## Cross-cutting

- Organization isolation is the primary access boundary.
- Email uniqueness is per organization, not global.
- Timezone for integration sync documentation is UTC unless a resource states otherwise.
- No automated erasure of historical operational, audit, or billing (N/A) records is implemented.
