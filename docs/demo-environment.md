# Demo environment (Trinetra Systems V1.0)

The seed creates **development demo** tenants. It is not a customer. Do not present demo rows as live plant data.

## How to seed

```bash
# development / CI only
pnpm db:seed
```

Blocked when `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true` on an **isolated** database.

## Demo organizations

| Slug | Purpose |
| --- | --- |
| `demo` | Primary development demo (`Trinetra Development Demo`) |
| `acme` | Second tenant for isolation tests |
| `frozen` | Suspended tenant |
| `archived` | Archived tenant |

All demo user passwords are the documented development password `demo-password`. Change them before any shared environment.

## What the demo can show

- Vehicle entry and **simulated** ANPR
- Document upload and **simulated** OCR
- Material workflows Type 1 / 2 / 3 (demo labels)
- Approval, weighment, unloading
- Weight anomaly inspection (software)
- Offline/sync behaviour with the Edge **simulator**
- Reports, support, maintenance
- Integration/webhook **TEST** credentials

## Simulated components

ANPR, OCR, default weighbridge adapters, Edge `EDGE_SIMULATOR=true`, and optional `SIMULATE_*` flags are **not** real hardware. The UI and APIs mark simulated sources. Never describe them as live indicator or camera output.
