# Hardware readiness (V1.0)

This document separates **software that was tested in this repository** from **work that needs real devices**.

It does not claim physical security, legal metrology approval, or manufacturer certification.

## SOFTWARE VERIFIED

Verified by code review and automated tests (simulator / recorded-text paths):

- Weighbridge device records, health, and configuration UI
- Simulator adapters for weight readings (source labeled `SIMULATED`)
- Generic serial / TCP / Modbus configuration and parser harness (not a live manufacturer session)
- Camera records and simulated ANPR
- Simulated OCR on uploaded files
- Edge Gateway process: bootstrap, heartbeat, local queue, idempotent event ids, dead-letter, local operator console
- Hardware pilot inventory and commissioning checklist UI (`PASS` / `FAIL` / `NOT_TESTED`)
- Weight anomaly engine on software samples (possible tampering / inspection required)
- Offline local store and sync loop against the API in tests

## REQUIRES REAL HARDWARE

Not production-tested in this repository:

- Real weighing indicator (serial, TCP, or Modbus session with the actual instrument)
- Legal-for-trade calibration and seals
- Real cameras and lenses at the weighbridge
- Real ANPR engine / vendor SDK
- Real document scanners
- Physical Edge Gateway appliance on the plant network
- Industrial / OT network segmentation
- Locked control cabinets, tamper-evident installation, restricted physical access
- Vendor firmware security and device credentials
- Site UPS / power protection
- Production installation status (`PRODUCTION` in the pilot module requires a documented manufacturer protocol)

## Remaining site requirements

Operators must still provide:

- Manufacturer, model, and protocol documentation for each indicator and camera
- Network diagram (weighbridge LAN vs office LAN vs internet)
- Unique gateway credentials (never the `tgw_devonly_...` development token)
- Physical maintenance procedures

See also `docs/hardware-pilot.md`, `docs/hardware-integration.md`, and `docs/hardware-information-required.md`.
