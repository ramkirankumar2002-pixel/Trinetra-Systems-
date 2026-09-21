# Trinetra Edge Gateway

Step 14 establishes the **site-side Edge Gateway**: a process that talks to local industrial devices and forwards normalized events to the central Trinetra API.

The Edge Gateway does **not** replace the weighing indicator. Load cells and the indicator remain responsible for measurement. The Edge only transports validated readings.

```
INDUSTRIAL HARDWARE
        ↓
TRINETRA EDGE GATEWAY
        ↓  HTTPS / API
TRINETRA BACKEND
        ↓
TRINETRA WEB APPLICATION
```

The central backend remains responsible for transactions, users, permissions, approvals, reporting, and the database. The Edge is not a second business-logic server.

## Process layout

| Process | Command | Default |
| --- | --- | --- |
| API | `pnpm dev:api` | http://localhost:4000 |
| Web | `pnpm dev:web` | http://localhost:5173 |
| Edge | `pnpm dev:edge` | local control http://127.0.0.1:4100 |

## Registration and authentication

Authorized management users create a gateway (`POST /api/v1/gateways`) and receive a **one-time** credential (`tgw_…`). The API stores only a SHA-256 hash.

The Edge authenticates with `Authorization: Bearer <gateway-token>`. Human session cookies are not used. A revoked or disabled gateway is rejected.

Development seed creates `TRINETRA-EDGE-01` on Demo Site. The development credential is documented in `apps/edge/.env.example` only. It is not a user password and must not be used in production.

## Heartbeat

The Edge reports version, platform, connected-device count, and device health on an interval (default 10 seconds).

The backend records last heartbeat and last communication. A gateway is marked **OFFLINE** only after `GATEWAY_OFFLINE_TIMEOUT_MS` (default 45 seconds). A brief network blip is not treated as a hardware failure.

## Device registry

Each device has organization, site, type, name, optional manufacturer/model/serial, protocol, connection type, enabled flag, status, last communication, and last error.

Types: `WEIGHBRIDGE_INDICATOR`, `CAMERA`, `SCANNER`, `BARCODE_SCANNER`, `SENSOR`, `PLC`, `OTHER`.

Secrets are never stored on device records and are stripped from API responses.

## Adapters

```
IDeviceAdapter
  IWeightProvider   Simulator / Serial* / TCP*
  ICameraProvider   Simulator / RTSP* / HTTP*
  IScannerProvider  Simulator / USB* / Network*
```

`*` = placeholder until the real protocol is known (Step 15). Simulator adapters implement the same interfaces as future hardware adapters.

## Event envelope

Every hardware event uses the same contract:

- `eventId` (unique, used for idempotency)
- `gatewayId`, `deviceId`, `deviceType`, `eventType`
- `timestamp` (device event time — never overwritten)
- `gatewayReceiveTime`
- backend receive time (stored on ingest)
- `payload`, `softwareVersion`

Event types: `DEVICE_WEIGHT_READING`, `DEVICE_ANPR_DETECTION`, `DEVICE_STATUS_CHANGED`, `DEVICE_SCAN_COMPLETED`.

Claimed `organizationId` / `siteId` on the event are ignored as authority. Registration is the source of truth. A mismatch is rejected.

## Local queue and idempotency

The Edge writes events to a persistent local store (`PENDING` → `SYNCING` → `SYNCED` / `FAILED` / `DEAD_LETTER`) with priority, dependencies, and retry backoff.

If the same `eventId` is received twice, the backend returns `ALREADY_PROCESSED` and does **not** create a second weighment, ANPR detection, document, or completion.

See [offline-first.md](./offline-first.md) for Step 17 offline operation and recovery.

## Data flows

**Weight:** indicator → weight adapter → normalized reading → queue → `POST /api/v1/edge/events` → existing `recordWeighment` when `captureOfficial` + `transactionId` are set. The Edge never calculates net weight.

**ANPR:** camera adapter → normalized plate → queue → existing vehicle identification (`ingestAnprFromEdge` → lookup/confirm workflow). The Edge does not confirm vehicles.

**Scanner:** scanner adapter → document bytes → queue → existing document upload when a transaction is supplied. The Edge is not the OCR engine.

## Security

- TLS/HTTPS in production (`EDGE_BACKEND_URL` must be HTTPS on a real site)
- Gateway credential, revocation, and RBAC (`gateway.read` / `gateway.manage`)
- No anonymous self-registration
- No remote physical-control commands (gates, barriers, lights, PLC writes)
- No arbitrary network or camera scanning
- Structured logs never include tokens or passwords
- Local control server binds to `127.0.0.1` only

## Simulator mode

`EDGE_SIMULATOR=true` (default for development) starts the same pipeline with simulator adapters.

Local control (localhost only):

- `POST /simulate/weight`
- `POST /simulate/anpr`
- `POST /simulate/scan`
- `POST /simulate/disconnect-backend`
- `POST /simulate/reconnect-backend`

## Management UI

`/weighbridge/gateways` shows gateway status, last heartbeat, software version, and device health. Users can enable/disable devices and run a **safe** communication test (last-seen window only). Credentials and secrets are not displayed.

## Clock handling

Keep three timestamps: device event time, gateway receive time, backend receive time. Production sites should synchronize system clocks (NTP). Do not silently replace the original device timestamp.

## Production hardware checklist

Do not invent specifications. Collect this information before Step 15:

**Weighbridge:** manufacturer, model, interface, protocol documentation, serial/Ethernet settings, weight message format, stable-weight indication, unit/scaling, connection manual.

**Camera:** manufacturer, model, RTSP/API support, resolution, FPS, network details, ANPR capability, API/SDK documentation.

**Scanner:** manufacturer, model, USB/network interface, driver/API, supported formats.

**Edge PC:** OS, CPU, RAM, storage, network interfaces, USB/serial ports, UPS/power backup.

## Known limitations

- OTA updates and remote hardware control are not implemented
- Serial/TCP/RTSP/Modbus adapters remain protocol-test or simulator except where Step 15 commissioned them. See [hardware-pilot.md](./hardware-pilot.md).
- Official weighment still belongs to the central transaction workflow after sync
- Local store is an atomic JSON file, not a replicated database. Use a UPS on the Edge PC.
