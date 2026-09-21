# Demo usernames and passwords

Development seed accounts only. They work after `pnpm db:seed` against a local database. They are **not** Firebase or production logins.

**Password for every account below:** `demo-password`

Change these before any shared or customer environment.

## Demo organization (`demo`)

| Username | Password | Role |
| --- | --- | --- |
| `admin@demo.local` | `demo-password` | Administrator |
| `implement@demo.local` | `demo-password` | Implementation engineer |
| `support@demo.local` | `demo-password` | Support engineer |
| `weighbridge@demo.local` | `demo-password` | Weighbridge operator |
| `store@demo.local` | `demo-password` | Store officer |
| `supervisor@demo.local` | `demo-password` | Supervisor |
| `store-b@demo.local` | `demo-password` | Store officer (Demo Site B) |
| `office@demo.local` | `demo-password` | Office manager |
| `inactive@demo.local` | `demo-password` | Inactive (cannot log in) |
| `site-b@demo.local` | `demo-password` | Site user (Demo Site B) |

## Isolated tenants

| Username | Password | Tenant |
| --- | --- | --- |
| `admin@acme.local` | `demo-password` | Acme (active) |
| `weighbridge@acme.local` | `demo-password` | Acme weighbridge operator |
| `admin@frozen.local` | `demo-password` | Frozen (suspended) |
| `admin@archived.local` | `demo-password` | Archived |

## Not for UI login

`edge.service@trinetra.local` is a service account. Seed assigns a random password; there is no documented UI password for it.
