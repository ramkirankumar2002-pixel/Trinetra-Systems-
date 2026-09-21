# Multi-tenant organization and site architecture

**Status:** Step 28  
**Related:** [organization-site-access.md](./organization-site-access.md), [tenant-security.md](./tenant-security.md), [database-design.md](./database-design.md)

Trinetra is multi-tenant at the **organization** boundary. Sites, weighbridges, departments, users, and transactions already belonged to an organization before this step. Step 28 extends that model. It does not add a second authorization system, ERP connector, or ML layer.

```text
Organization  (tenant)
  └── Site
        └── Weighbridge
              └── Devices / cameras / gateway attachments
  └── Departments
  └── Users (one account, many site or weighbridge assignments)
  └── Master data (materials, vehicles, workflows, suppliers)
  └── Transactions → documents, approvals, unloading, weighments
```

Example:

```text
Demo (kind=DEMO)
 ├── Demo Site
 │    └── WB-01
 └── Demo Site B
      └── WB-01

Acme Isolated Tenant (kind=CUSTOMER)
 └── Acme Plant
      └── WB-ACME
```

Data from Acme is never returned to Demo users. Frontend dropdowns are not authorization.

## Architecture

```text
PostgreSQL rows keyed by organizationId / siteId
        ↓
Authentication (session JWT includes org)
        ↓
Organization context (status, kind, membership)
        ↓
Site / weighbridge scope (UserRole.siteId / UserRole.weighbridgeId)
        ↓
Permission check (existing RBAC)
        ↓
Requested site / weighbridge belongs to this organization
        ↓
Resource query always includes organizationId
        ↓
Business operation
```

Reports, notifications, audit, hardware ingest, and offline sync reuse this path. There is no reporting warehouse and no duplicate tenant filter layer.

## Platform admin vs organization admin

There is **no platform administrator** in the running application.

| Role | Scope |
| --- | --- |
| `ADMIN` | Organization administrator. Manages only their own organization. |
| Other seeded roles | Organization members, often limited to one site |

A normal administrator cannot list, modify, or inspect another organization. Unarchiving an `ARCHIVED` organization is an operations procedure until a platform-admin product exists.

## Lifecycle

| Entity | Status | Effect |
| --- | --- | --- |
| Organization | `ACTIVE` | Normal operations |
| Organization | `SUSPENDED` | Login allowed. Transaction, document, and approval writes are blocked. Historical reads remain. |
| Organization | `ARCHIVED` | Login blocked. Data is retained. |
| Site | `ACTIVE` | Accepts new transactions |
| Site | `INACTIVE` | No new transactions. Existing records remain visible to authorized users. |

Organizations and sites are not deleted casually. Users, vehicles, and materials already use soft delete.

## Configuration precedence

Step 27 customer-configuration product work is **out of scope** for this step. Existing settings already live at these levels:

| Setting | Level |
| --- | --- |
| Organization kind / status | Organization |
| Timezone, operation mode, site status | Site |
| Weighbridge `isActive`, hardware profile | Weighbridge |
| Offline policy | Organization + site (`OfflinePolicy`) |

When a later configuration catalog is added, inherit **weighbridge → site → organization → platform default**. Until then, do not invent an extra config table.

## Master data scope

| Entity | Scope |
| --- | --- |
| Permission catalog | Global |
| Organization slug | Global unique |
| Role, department, user, material, workflow, vehicle, driver, supplier | Organization |
| Site | Organization |
| Weighbridge, unloading point, camera, gateway | Site |
| Edge device | Gateway |
| Transaction | One organization + one site |
| Document / approval / unloading | Inherit the transaction |
| Notification | Organization + recipient user |
| Audit / security events | Organization (site where present) |

## Unique identifiers

Unique **within organization** (not globally): site code, department code, role code, user email, vehicle registration, material code, supplier code, workflow code, driver license, gateway code, transaction reference.

Unique **within site**: weighbridge code, unloading point code.

Unique **globally**: organization slug, permission code.

Two companies may therefore both have a vehicle `TN01AB1234` or a site code `PLANT-1`.

## User membership

A user belongs to **one organization**. The same person does not get a second account for a second site. `UserRole` may repeat per site. Optional `weighbridgeId` further limits weighbridge operators. `siteId` null and no weighbridge means organization-wide (typical `ADMIN`).
