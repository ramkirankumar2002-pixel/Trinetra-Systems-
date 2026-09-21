# Customer support tickets

This document describes Trinetra support tickets. It is not a service-level agreement, partnership claim, or outsourced helpdesk product.

## Purpose

Authorized customer users report operational problems. Authorized support users investigate, assign, and resolve those tickets inside the same organization. Every ticket is tenant-scoped.

## Workflow

```text
Customer/user creates ticket
        ↓
OPEN
        ↓
Support acknowledges
        ↓
Assigned and investigated
        ↓
Maintenance/technical action if required
        ↓
Resolution recorded
        ↓
Customer confirmation where permitted
        ↓
RESOLVED → CLOSED
```

Invalid status changes are rejected (`409`). Tickets are not deleted; `CANCELLED` archives an unused ticket.

Allowed transitions:

| From | To |
| --- | --- |
| OPEN | ACKNOWLEDGED, IN_PROGRESS, CANCELLED |
| ACKNOWLEDGED | IN_PROGRESS, WAITING_FOR_CUSTOMER, CANCELLED |
| IN_PROGRESS | WAITING_FOR_CUSTOMER, WAITING_FOR_MAINTENANCE, RESOLVED, CANCELLED |
| WAITING_FOR_CUSTOMER | IN_PROGRESS, RESOLVED, CANCELLED |
| WAITING_FOR_MAINTENANCE | IN_PROGRESS, RESOLVED, CANCELLED |
| RESOLVED | CLOSED, IN_PROGRESS |
| CLOSED / CANCELLED | none |

A customer with comment access may close a **RESOLVED** ticket or cancel an **OPEN** ticket they created. Other transitions require `support.ticket.manage`.

## Categories and priority

Categories: WEIGHBRIDGE, DEVICE, GATEWAY, ANPR, DOCUMENT_SCANNER, SOFTWARE, NETWORK, OFFLINE_SYNC, USER_ACCESS, TRANSACTION, REPORTING, OTHER.

Priority: LOW, MEDIUM, HIGH, CRITICAL. Not every ticket is a hardware issue.

Tickets may link a weighbridge, gateway, device, transaction, security event, operational alert, or weight anomaly **in the same organization and site**. Linking another tenant’s records is rejected.

## Visibility

| Record | Customer (`support.ticket.read` without `support.internal`) | Support engineer (`support.internal`) |
| --- | --- | --- |
| Ticket fields and resolution | Yes, own org/site | Yes, own org/site |
| Customer comments | Yes | Yes |
| Internal notes | No | Yes |
| Audit log | Only if `audit.read` | Only if `audit.read` |

Organization administrators receive ticket manage/read permissions but **not** `support.internal`. Internal notes stay private to support/implementation roles that are granted that permission.

## Roles and permissions

| Permission | Meaning |
| --- | --- |
| `support.ticket.create` | Create a ticket |
| `support.ticket.read` | List/get tickets in scope |
| `support.ticket.comment` | Customer-visible comments; close resolved tickets |
| `support.ticket.manage` | Assign, priority, most status changes, edit links |
| `support.internal` | Read/write internal notes |

Site-scoped users only see tickets for sites they can access. Cross-organization IDs return `404`. Unauthorized same-org sites return `403`.

## Notifications

Reuses `safeEmitOperationalEvent`. Types: `SUPPORT_TICKET_CREATED`, `SUPPORT_TICKET_CRITICAL` (creates an operational alert), `SUPPORT_TICKET_ASSIGNED`. Duplicate `eventKey` values are skipped. Hardware alerts are **not** auto-converted into tickets; operators can open a ticket from a device or alert with prefilled IDs.

## Audit

`SUPPORT_TICKET_CREATED`, `_UPDATED`, `_ASSIGNED`, `_STATUS_CHANGED`, `_PRIORITY_CHANGED`, `_COMMENT_ADDED`, `_CLOSED`. Ordinary customer users do not receive these audit rows in the ticket UI.

## APIs

All under `/api/v1/support`, authenticated, RBAC, org/site scoped, paginated lists (`pageSize` max 50):

- `GET /catalog`, `GET /dashboard`, `GET /assignees`
- `GET/POST /tickets`, `GET/PATCH /tickets/:id`
- `POST /tickets/:id/assign|priority|status|close|comments`

## UI

Support dashboard, ticket list, create ticket, ticket details. Customer UI is the same routes with internal notes omitted. Demo tickets in the development seed are labelled **Demo:** and are not real customer cases.
