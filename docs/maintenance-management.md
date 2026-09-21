# Maintenance management

This document describes **service maintenance records**. It does not implement predictive maintenance, automatic parts purchasing, or PLC control.

## Two different records

| Record | Model | Meaning |
| --- | --- | --- |
| Weighbridge maintenance window | `MaintenanceEvent` | Timed window used by existing anomaly suppression. Started/ended with `maintenance.manage`. |
| Service work order | `ServiceMaintenanceRecord` | Corrective, preventive, inspection, calibration, commissioning, repair, or other work. |

Step 30 adds service records and **links** them to an existing window when the actor also has `maintenance.manage` and a weighbridge is selected. Safety/security systems are not disabled automatically.

## Lifecycle

```text
SCHEDULED → IN_PROGRESS → COMPLETED
     \              \
      \              → CANCELLED
       → CANCELLED
```

Invalid transitions return `409`. Records are not hard-deleted.

## Fields

Organization, site, optional weighbridge/gateway/device, type, reason, description, performed by, start/end/completed timestamps, findings, action taken, parts replaced, before/after notes, related ticket, related operational/security event, optional `MaintenanceEvent`.

Types: CORRECTIVE, PREVENTIVE, INSPECTION, CALIBRATION, COMMISSIONING, REPAIR, OTHER.

## Device service history

`GET /api/v1/support/devices/:id/history` and `GET /api/v1/support/weighbridges/:id/history` reuse existing installation status, commissioning tests, operational alerts, weight anomalies, and maintenance windows. They do not duplicate live device health monitoring.

## Creation from context

Authorized users can open **Create maintenance** from a device, weighbridge, or ticket. Site and equipment IDs are taken from that context. The API rejects devices that belong to another organization (`404`) or an unauthorized site (`403`).

## Notifications and audit

Notifications: `SUPPORT_MAINTENANCE_STARTED`, `SUPPORT_MAINTENANCE_COMPLETED` (ticket owner is included as an extra recipient when present).

Audit: `SERVICE_MAINTENANCE_CREATED`, `_STARTED`, `_COMPLETED`, `_CANCELLED`, `_DEVICE_CHANGED`.

## Permissions

| Permission | Meaning |
| --- | --- |
| `support.maintenance.read` | List/get records and dashboard maintenance panels |
| `support.maintenance.manage` | Create, start, complete, cancel |
| `maintenance.manage` | Existing weighbridge window start/end; optional link from a service record |

Customer ticket roles do not receive maintenance manage unless they already have supervisor/office/support/admin staff permissions.

## APIs

- `GET/POST /api/v1/support/maintenance`
- `GET/PATCH /api/v1/support/maintenance/:id`
- `POST /api/v1/support/maintenance/:id/start|complete|cancel`

Lists are paginated. Tenant isolation matches tickets: organization on every query, site access on every record.

## UI

Active/history list, create form, detail with start/complete/cancel, and device/weighbridge history timelines. Demo seed records are labelled **Demo** and are development data only.
