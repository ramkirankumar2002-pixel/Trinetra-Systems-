# Trinetra Systems

Smart Weighbridge Automation & Material Intelligence Platform
## 🌐 Live Demo

The live version of **Trinetra Systems** is available here:

👉 **[Visit Trinetra Systems – Live Demo](https://trinetra-systems-2026.web.app)**

You can explore the application and experience the Trinetra Systems platform directly through the live demo.

## Purpose

Trinetra Systems is an industrial automation platform that digitizes and automates the complete workflow around industrial weighbridges.

## Core Workflow

1. Vehicle Entry
2. Vehicle Identification
3. Document Verification
4. Material Identification
5. Material Classification
6. First Weighment
7. Departmental Approval
8. Unloading
9. Second Weighment
10. Net Weight Calculation
11. Transaction Completion
12. Security Monitoring

## Target Users

- Drivers
- Weighbridge Operators
- Store Officers
- Supervisors
- Site Personnel
- Plant Personnel
- Lab Personnel
- Office/Management Users
- Administrators

## Departments

Weighbridge, Store, Lab, Plant, Site, Office, and Others.

## Current development stage

**Trinetra Systems V1.0 (1.0.0)** is a **controlled software freeze** for a supervised site pilot. It is not independently certified production, and it does not include real manufacturer hardware.

See:

- [docs/v1-release-notes.md](./docs/v1-release-notes.md)
- [docs/v1-feature-inventory.md](./docs/v1-feature-inventory.md)
- [docs/TRINETRA-V1.0-RELEASE-REPORT.md](./docs/TRINETRA-V1.0-RELEASE-REPORT.md)
- [docs/installation-guide.md](./docs/installation-guide.md)
- [docs/hardware-readiness.md](./docs/hardware-readiness.md)

The API can start without PostgreSQL. Login, migrations, and seed need a real `DATABASE_URL`. Demo seed is blocked when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`.

Design documents:

- [docs/architecture.md](./docs/architecture.md)
- [docs/database-design.md](./docs/database-design.md)
- [docs/dashboard.md](./docs/dashboard.md)
- [docs/edge-gateway.md](./docs/edge-gateway.md)
- [docs/offline-first.md](./docs/offline-first.md)
- [docs/driver-mode.md](./docs/driver-mode.md)
- [docs/security.md](./docs/security.md)
- [docs/backup-recovery.md](./docs/backup-recovery.md)
- [docs/restore-procedure.md](./docs/restore-procedure.md)
- [docs/disaster-recovery.md](./docs/disaster-recovery.md)
- [docs/database-migration-safety.md](./docs/database-migration-safety.md)

## Architecture

This repository is a **monorepo**: one Git project that contains more than one application.

| Folder | What it is |
| --- | --- |
| `apps/web` | React + TypeScript + Vite user interface |
| `apps/api` | Node.js + TypeScript + Express backend |
| `apps/edge` | Site-side Edge Gateway (simulator by default) |
| `apps/api/prisma` | Prisma + PostgreSQL schema and migrations |

The browser never talks to the database. The frontend calls the API. The API will talk to PostgreSQL through Prisma in a later step.

Hardware, cameras, ANPR, OCR, AI, and live weighbridge devices are **not** connected yet. Those will be simulated first and replaced later through `apps/api/src/integrations`.

Material classification rules (including Type 1 / Type 2 / Type 3) must stay configurable. They will not be hard-coded.

## How to run

You need Node.js 20 or newer and [pnpm](https://pnpm.io/).

```bash
pnpm install
```

Frontend (http://localhost:5173):

```bash
pnpm dev:web
```

Backend (http://localhost:4000):

```bash
copy apps\api\.env.example apps\api\.env
pnpm dev:api
```

The backend health check is `GET http://localhost:4000/health`. The API starts without PostgreSQL.

Edge Gateway (simulator, after API + seed):

```bash
copy apps\edge\.env.example apps\edge\.env
pnpm dev:edge
```

Local simulator control binds to `http://127.0.0.1:4100` only. See [docs/edge-gateway.md](./docs/edge-gateway.md).

## Database

Prisma schema and the initial migration live in `apps/api/prisma`.

1. Install PostgreSQL locally and create an empty database, for example `trinetra`.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Replace `DATABASE_URL` with your real local connection string. Do not commit `.env`.
4. Apply the migration and optional demo seed:

```bash
pnpm db:generate
pnpm --filter @trinetra/api db:migrate:deploy
pnpm db:seed
```

The seed creates a **development demo** organization (`demo`), not a real customer. Materials are not permanently assigned to Type 1 / Type 2 / Type 3.

Development-only login accounts, all password `demo-password`. Full list: [demo-accounts/usernames-and-passwords.md](./demo-accounts/usernames-and-passwords.md).

Change these before any production deployment.

## Authentication

Sessions use an httpOnly cookie (`trinetra_session`), not localStorage. The Vite dev server proxies `/api` to the backend so the cookie stays first-party.

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Login is rate-limited to 10 attempts per email every 15 minutes (`AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS`).

## Environment variables

Copy each example file. Do not put real passwords or secrets into Git.

- `apps/web/.env.example` → `apps/web/.env`
- `apps/api/.env.example` → `apps/api/.env`

## Weighbridge MVP

After login, authorized users can open Weighbridge operations:

1. Simulate ANPR (no camera is connected)
2. Find or register the vehicle
3. Create a transaction (`TRN-YYYY-000001`)
4. Record the first/gross weight (typed or simulated)
5. Review the transaction and history

ANPR and load-cell ports live in `apps/api/src/integrations`. Only simulated providers are wired.

```bash
pnpm test
```

## Management dashboard

Authorized users open **Dashboard** after login. KPI cards, live jobs, pending approvals/unloading, exceptions, and recent audit rows come from the database. Office and supervisor roles can also open **Reports**.

Date-only filters use the site timezone (`Asia/Kolkata` in the demo), not UTC midnight. The dashboard refreshes every 15 seconds while the tab is visible.

See [docs/dashboard.md](./docs/dashboard.md) for APIs, RBAC, and demo references such as `TRN-DEMO-DASH-ACTIVE`.

## After V1.0

Not in this freeze: real manufacturer adapters, MFA/SSO, user-admin HTTP API, billing, email/SMS, and independently tested disaster recovery. Hardware and OCR/ANPR engines remain site-specific. Do not describe software anomalies as proven fraud.

See [docs/v1-feature-inventory.md](./docs/v1-feature-inventory.md).
