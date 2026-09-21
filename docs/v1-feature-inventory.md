# Trinetra Systems V1.0 feature inventory

Statuses are taken from the current repository (Steps 1–33 plus this release freeze). A UI screen is not enough to mark a feature COMPLETE.

Statuses used: **COMPLETE**, **PARTIAL**, **FOUNDATION_ONLY**, **REQUIRES_HARDWARE**, **REQUIRES_CONFIGURATION**, **REQUIRES_EXTERNAL_SERVICE**, **NOT_VERIFIED**.

“Tested?” means automated tests in this repository, not a customer site or real hardware.

| Feature | Status | Implemented? | Tested? | Demo-ready? | Production dependency | Known limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Authentication | COMPLETE | Yes (email/password, httpOnly JWT cookie) | Yes (Steps 19, 33) | Yes | Unique `JWT_SECRET`, HTTPS | No MFA, SSO, or password-reset API |
| RBAC | COMPLETE | Yes (`requirePermission`, seeded catalog) | Yes | Yes | Site-scoped role assignments | No HTTP user-admin API; ADMIN does not bypass permissions except documented department middleware |
| Multi-tenancy | COMPLETE | Yes (organization + site) | Yes (Step 28) | Yes | Distinct organizations per customer | Org-wide `site = null` roles skip site filters; vehicles are org-scoped |
| Organization / site management | COMPLETE | Yes | Yes (Steps 28–29) | Yes | Operator creates real orgs | Demo orgs must not be reused as customers |
| Customer onboarding | COMPLETE | Yes (wizard + validation) | Yes (Step 29) | Yes | Implementation user, site data | Does not provision real hardware |
| Vehicle management | COMPLETE | Yes | Yes (Step 5+) | Yes | Master data entry | Not site-scoped |
| Transactions | COMPLETE | Yes | Yes (Steps 5–9) | Yes | PostgreSQL | Completed rows are immutable except controlled correction |
| Weighments | COMPLETE (software) | Yes (manual / simulated / device source) | Yes | Yes (simulator) | Real indicator for live weights | **REQUIRES_HARDWARE** for production weights |
| Document management | COMPLETE (software) | Yes (upload, MIME, authz) | Yes (Steps 6, 33) | Yes | Writable storage directory | Local filesystem, no antivirus |
| OCR | FOUNDATION_ONLY | Simulated provider | Yes (simulated) | Yes (labeled simulated) | Real OCR engine | **REQUIRES_EXTERNAL_SERVICE** / vendor for production OCR |
| ANPR | FOUNDATION_ONLY | Simulated provider + camera adapters | Yes (simulated) | Yes (labeled simulated) | Real camera/ANPR | **REQUIRES_HARDWARE** |
| Material management | COMPLETE | Yes | Yes (Step 7) | Yes | Material master | Units from env catalog |
| Type 1 / 2 / 3 workflows | COMPLETE | Yes, **organization-configurable** | Yes (Step 7) | Yes | Workflows configured per org | Not industry standards; demo names only |
| Approval workflow | COMPLETE | Yes | Yes (Step 8) | Yes | Department assignees | Unauthorized users cannot decide |
| Unloading | COMPLETE | Yes | Yes (Step 9) | Yes | Unloading points | Missing point blocks assignment |
| Gross / tare / net | COMPLETE | Yes, net calculated server-side | Yes | Yes | Valid weighments | Tare above gross is flagged, not silently stored as a valid net |
| Dashboard | COMPLETE | Yes | Yes (Step 10) | Yes | `dashboard.read` | Polling, not a separate realtime bus |
| Reports | COMPLETE (software) | Yes | Yes (Step 26) | Yes | `report.read` | Not load-tested for large estates |
| Notifications | COMPLETE (in-app) | Yes | Yes (Step 11) | Yes | Running API process | No email/SMS gateway |
| Operational alerts | COMPLETE | Yes | Yes | Yes | Permissions | Observation language, not fraud verdicts |
| Hardware integration | FOUNDATION_ONLY | Simulator + serial/TCP/Modbus stubs | Yes (simulator) | Yes (simulator) | Manufacturer protocol | **REQUIRES_HARDWARE**; no vendor firmware in repo |
| Edge Gateway | COMPLETE (software) | Yes (simulator default) | Yes (Step 14, edge tests) | Yes (simulator) | Unique `tgw_` credential | **REQUIRES_HARDWARE** for a physical gateway |
| Offline operation | COMPLETE (software) | Yes | Yes (Step 17, edge tests) | Partial (local sim) | Edge process + disk | Customer WAN failovers **NOT_VERIFIED** |
| Synchronization | COMPLETE (software) | Yes (idempotent event ids, dead-letter) | Yes | Yes (sim) | Reachable API | Duplicate protection is event-id based |
| Driver-friendly UI | COMPLETE (software) | Yes (`/weighbridge/driver`) | Yes (Step 18, web tests) | Yes | `driver.mode` | Browser speech APIs; not a certified kiosk |
| Multilingual foundation | PARTIAL | Driver locale en / hi / te | Yes (driver tests) | Yes (driver) | `DRIVER_LANGUAGES` | Rest of UI is English |
| Voice workflow | FOUNDATION_ONLY | Local/simulated prompts | Yes (unit) | Yes | Browser audio | Not a cloud TTS/STT product |
| Weight anomaly detection | COMPLETE (software) | Yes | Yes (Step 16) | Yes (sim) | Thresholds | Possible tampering / inspection required — not “fraud detected” |
| Security / audit | COMPLETE (application) | Yes | Yes (Steps 19, 33) | Yes | Production secrets | Pentest **NOT_VERIFIED**; audit not deletable via API |
| Backup / recovery | PARTIAL | Optional `pg_dump` | Unit tests only | N/A | Operator WAL/PITR | Restore **NOT_VERIFIED** |
| Monitoring / observability | PARTIAL | In-process metrics, health | Yes (Step 21) | Yes | Log shipping optional | Not a historical APM |
| Customer support | COMPLETE (software) | Yes | Yes (Step 30) | Yes | Support roles | Internal notes hidden from customers |
| Maintenance | COMPLETE (software) | Yes | Yes (Step 30) | Yes | Maintenance permission | Physical work still on site |
| Billing / subscription | Not in this repository | No | N/A | N/A | N/A | Do not claim billing; no card data stored |
| Integration API | COMPLETE (software) | Yes (`/api/v1/ext`) | Yes (Step 32) | Yes (TEST secrets) | Hashed credentials | Live ERP connectors are not bundled |
| Webhooks | COMPLETE (software) | Yes (HMAC, retries, SSRF checks) | Yes (Steps 32–33) | Yes (non-prod HTTP allowed) | HTTPS endpoints in production | DNS rebinding **REQUIRES_EXTERNAL** validation |
