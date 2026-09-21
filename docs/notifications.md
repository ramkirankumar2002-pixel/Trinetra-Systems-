# Trinetra Systems — Notifications and operational alerts

**Audience:** product owner and developers  
**Status:** Step 11 implemented. In-app notifications and operational alerts only. Email, SMS, WhatsApp, push, and WebSockets are later.  
**Related:** [architecture.md](./architecture.md), [database-design.md](./database-design.md), [dashboard.md](./dashboard.md)

---

## 1. Architecture

Two complementary records:

| Concept | Model | Meaning |
| --- | --- | --- |
| Notification | `Notification` | A private in-app message for one user |
| Operational alert | `OperationalAlert` | A site-scoped attention item for authorized operations/management |

`SecurityEvent` is now used by Step 16 weight-anomaly detection (`WEIGHT_ANOMALY`). It still does not mean fraud was proven. Alerts do **not** replace the Step 10 exception list. The dashboard still shows transaction exceptions; the alerts panel overlays unresolved attention items created from the same workflow events. Step 16 also emits `WEIGHT_ANOMALY` notifications when a confirmed weight anomaly is created.

Business services call `safeEmitOperationalEvent` **after** the Prisma transaction commits. A recoverable emit failure is logged and does not roll back weighment, approval, unloading, or completion.

```text
Workflow service (committed)
        ↓
safeEmitOperationalEvent
        ↓
Recipient routing (org + site + role + department + permission + preferences)
        ↓
Notification rows (unique recipient + eventKey)
        +
OperationalAlert row when the event requires attention (unique org + eventKey)
```

---

## 2. Notification types

| Type | Category | Severity | Alert? | Recipients |
| --- | --- | --- | --- | --- |
| `APPROVAL_REQUIRED` | APPROVAL | WARNING | Yes | Users who can decide that approval at that site |
| `APPROVAL_APPROVED` | APPROVAL | SUCCESS | No | Operators / dashboard readers at the site |
| `APPROVAL_REJECTED` | APPROVAL | ERROR | No | Same as approved, plus a `WORKFLOW_EXCEPTION` alert |
| `DOCUMENT_REVIEW_REQUIRED` | WORKFLOW | WARNING | Yes | `document.verify` |
| `DOCUMENT_VERIFIED` | WORKFLOW | SUCCESS | No | Weighbridge operators |
| `UNLOADING_ASSIGNED` | WORKFLOW | INFO | No | Unloading assign/manage |
| `UNLOADING_STARTED` | WORKFLOW | INFO | No | Unloading assign/manage |
| `UNLOADING_COMPLETED` | WORKFLOW | SUCCESS | No | Unloading + weighment |
| `SECOND_WEIGHMENT_REQUIRED` | WORKFLOW | WARNING | Yes | `weighment.record` |
| `TRANSACTION_COMPLETED` | WORKFLOW | SUCCESS | No | Dashboard / reports / finalize |
| `TRANSACTION_EXCEPTION` | EXCEPTION | ERROR | Yes | Dashboard / reports / correct |
| `WEIGHT_EXCEPTION` | EXCEPTION | ERROR | Yes | Same + weighment |
| `WORKFLOW_EXCEPTION` | EXCEPTION | ERROR | Yes | Dashboard / reports / correct |
| `SYSTEM_ALERT` | SYSTEM | ERROR | Yes | Dashboard readers |

Legacy `APPROVAL_REQUESTED` rows are normalized to `APPROVAL_REQUIRED`.

---

## 3. Recipient routing

The actor who caused the event is excluded. Recipients must be:

- Active
- Same organization
- Able to access the site (org-wide role, default site, or site-scoped role)
- Matching the event rule (department + `approval.decide` for approvals, or the event’s permissions)
- Not opted out of that category (`NotificationPreference.inAppEnabled`, default true)

Site B store officers do not receive Site A approval notifications.

---

## 4. Duplicate protection

Each notification is unique on `(recipientUserId, eventKey)`.

Examples:

- `approval.required:{approvalId}` — creating the same pending approval twice does not notify again
- `approval.approved:{approvalId}` — a later legitimate decision is a different key
- `unloading.assigned:{transactionId}:{pointId}:{assignedAt}` — reassignment is a new event
- `weight.exception:{transactionId}` — the same tare-over-gross result is not re-alerted

---

## 5. Alert lifecycle

`OPEN` → `ACKNOWLEDGED` → `RESOLVED`

- View: `dashboard.read` plus site scope
- Acknowledge / resolve: `ADMIN`, `SUPERVISOR`, or `report.read`
- Related alerts auto-resolve when the underlying work completes (approval decided, document verified, transaction completed)

This is not a second exception engine. Transaction `EXCEPTION` / `REJECTED` / `ON_HOLD` rows remain on the existing exceptions panel.

---

## 6. APIs

All routes require authentication. Notifications are owned by `recipientUserId`. Changing an ID in the URL cannot read another user’s row.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/notifications` | Filters: `read`, `severity`, `type`, `from`, `to`. Paginated. Includes unread totals |
| GET | `/api/v1/notifications/unread-count` | `unreadCount`, `bySeverity`, `byType` |
| GET | `/api/v1/notifications/:id` | Owner only |
| POST | `/api/v1/notifications/:id/read` | Owner only |
| POST | `/api/v1/notifications/:id/unread` | Owner only |
| POST | `/api/v1/notifications/read-all` | Current user only |
| GET | `/api/v1/notifications/preferences` | Category foundation |
| PATCH | `/api/v1/notifications/preferences` | `{ category, inAppEnabled }` |
| GET | `/api/v1/alerts` | `dashboard.read`. Filters: `status`, `severity`, `type`, `siteId`, `from`, `to` |
| GET | `/api/v1/alerts/:id` | Site-scoped |
| POST | `/api/v1/alerts/:id/acknowledge` | Authorized management |
| POST | `/api/v1/alerts/:id/resolve` | Authorized management |

List responses return `items`, `page`, `pageSize`, `total`, `totalPages`.

The dashboard payload also includes `alerts` (unresolved, newest first, severity-ranked). The bell polls every 30 seconds when the tab is visible. The dashboard continues its 15 second refresh. No WebSockets.

---

## 7. Database

See migration `20260920220000_notifications_operational_alerts`.

- `Notification` gained `siteId`, `category`, `severity`, `entityType`, `entityId`, `eventKey`
- `NotificationPreference` — per-user category toggles
- `OperationalAlert` — OPEN / ACKNOWLEDGED / RESOLVED with actor timestamps

---

## 8. RBAC

| Action | Rule |
| --- | --- |
| Read own notifications | Authenticated, `recipientUserId = session user` |
| Mark all read | Same ownership filter |
| View alerts | `dashboard.read` + site access |
| Acknowledge / resolve | `ADMIN`, `SUPERVISOR`, or `report.read` |
| Audit | Existing `AuditLog` (`NOTIFICATION_*`, `ALERT_*`) |

---

## 9. Workflow hooks

| When | Notification |
| --- | --- |
| Pending approval exists after weighment / get / approve-next | `APPROVAL_REQUIRED` |
| Approval approved | `APPROVAL_APPROVED` |
| Approval rejected | `APPROVAL_REJECTED` + `WORKFLOW_EXCEPTION` |
| OCR extracted | `DOCUMENT_REVIEW_REQUIRED` |
| Document verified / rejected | `DOCUMENT_VERIFIED` / `WORKFLOW_EXCEPTION` |
| Unloading assigned / started / completed | matching unloading types |
| Unloading completed | also `SECOND_WEIGHMENT_REQUIRED` |
| Tare exceeds gross | `WEIGHT_EXCEPTION` |
| Transaction completed | `TRANSACTION_COMPLETED` |

---

## 10. Known limitations

- In-app only. No email, SMS, WhatsApp, or mobile push
- No WebSockets; unread count uses 30s polling
- Preferences cover categories, not channels
- Maintenance windows do not emit `SYSTEM_ALERT` yet
- Fraud/tamper alerts are not implemented (`SecurityEvent` is unused here)
- Hardware, OCR, ANPR, ERP, and offline sync remain later steps
