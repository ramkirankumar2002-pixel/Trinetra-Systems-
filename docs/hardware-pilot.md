# Hardware pilot (Step 15)

Step 15 prepares Trinetra for a real site pilot. It does **not** claim that a manufacturer device has been integrated.

```
REAL HARDWARE
      ↓
EDGE GATEWAY
      ↓
DEVICE ADAPTER
      ↓
NORMALIZED EVENT
      ↓
LOCAL QUEUE
      ↓
TRINETRA API
      ↓
EXISTING BUSINESS WORKFLOW
      ↓
DATABASE
      ↓
WEB DASHBOARD
```

## Real hardware models detected

None. This repository contains no manufacturer, model, or protocol specification for an indicator, camera, or scanner.

## Protocols actually supported

| Path | Label | Status |
| --- | --- | --- |
| Simulator adapters | SIMULATED | Working |
| Generic recorded-text harness | PROTOCOL TEST | Working, not a manufacturer protocol |
| Serial / TCP / Modbus foundations | PROTOCOL DETAILS REQUIRED | Configuration and validation only; no live manufacturer session |
| Documented manufacturer adapter | REAL HARDWARE TEST | Not available |

Real hardware adapter cannot be finalized until the manufacturer/model/protocol documentation is provided.

## Operation modes

Sites have `SIMULATION`, `PILOT`, or `PRODUCTION`. New transactions inherit the site mode so pilot data is visible and is not silently treated as production.

Trinetra reads the indicator measurement. It does not apply software weight offsets or legally calibrate the weighbridge.

## Inventory and commissioning

Authorized users (`hardware.pilot`, supervisors, office managers, admins) use `/weighbridge/pilot`.

The page shows gateway heartbeat, indicator/camera/scanner inventory, last communication, commissioning results (`PASS` / `FAIL` / `NOT_TESTED`), and technical diagnostics. Drivers do not see raw diagnostic frames. Secrets are never stored or displayed.

Installation statuses: `PLANNED`, `CONFIGURED`, `CONNECTED`, `TESTING`, `PILOT`, `PRODUCTION`, `DISABLED`.

`PRODUCTION` installation requires a documented manufacturer protocol, which is not available yet.

## Adapters

Manufacturer-specific code stays isolated:

```
apps/edge/src/adapters/weight/simulator.ts
apps/edge/src/adapters/weight/protocolTest.ts
apps/edge/src/adapters/weight/undeployed.ts
apps/edge/src/adapters/weight/manufacturer/   (empty until documentation exists)
```

The same isolation applies to cameras and scanners. The transaction engine never sees manufacturer details.

## Safety

This pilot is for reading, monitoring, identification, and document capture.

Do not implement barrier control, traffic lights, gate opening, PLC actuation, or other machinery control.

If a configured serial port does not exist, Edge reports `DEVICE NOT AVAILABLE` and continues. TCP connects only to an explicitly configured host. The network is never scanned.

## Clock policy

Each event keeps device time, Edge receive time, and backend receive time. An invalid device clock is recorded and gateway receipt time is used.

## Offline

Step 14's local queue still applies: `PENDING` → `SYNCING` → `SYNCED`, or `FAILED` with retry. Event IDs remain unique.

## Pilot demo (simulated)

Use the existing workflow. Label it SIMULATED until real protocol documentation arrives.

1. Edge Gateway online.
2. Simulator indicator, camera, and scanner connected.
3. Vehicle arrives.
4. ANPR detects the plate.
5. Operator confirms.
6. Transaction created (inherits site `SIMULATION` or `PILOT` mode).
7. Document scanned into the existing OCR review path.
8. Material and Type 1/2/3 workflow run as today.
9. Approval if required.
10. Stable gross, unload, stable tare, net, finalize.
11. Dashboard, notifications, and audit update.
12. Hardware Pilot page shows device health and commissioning.

## Related

- `docs/hardware-information-required.md`
- `docs/hardware-integration.md`
- `docs/camera-anpr-integration.md`
- `docs/edge-gateway.md`
