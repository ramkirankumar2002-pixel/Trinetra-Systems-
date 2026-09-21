# Offline-first Edge operation

Step 17 adds a **controlled local operational layer** so a weighbridge can keep reading hardware when the central Trinetra backend or internet path is temporarily unavailable.

Offline mode does **not** mean the entire Trinetra backend is duplicated on the Edge.

```
REAL HARDWARE
      ↓
TRINETRA EDGE GATEWAY
      ↓
LOCAL-FIRST OPERATION
      ↓
LOCAL EVENT / TRANSACTION QUEUE
      ↓
INTERNET AVAILABLE
      ↓
SECURE SYNCHRONIZATION
      ↓
TRINETRA BACKEND
      ↓
CENTRAL DATABASE
      ↓
WEB DASHBOARD
```

The Edge continues talking to local indicators, cameras, and scanners. It stores a minimum of site-scoped state. Approvals, user management, configuration changes, and hardware configuration remain central.

## Edge local storage

The Edge writes an atomic JSON store (`data/store.json`) plus captured files under `data/files/`.

Stored locally:

- Gateway and device runtime state
- Event queue with retry / dead-letter metadata
- Synchronization snapshot
- Minimum local transaction context
- Versioned configuration cache
- File metadata and hashes
- Local audit records
- Detected conflicts

Not stored:

- The production PostgreSQL database
- Central admin passwords
- Unrestricted user credentials
- A second workflow / approval engine

Writes go to a temp file, then replace the store. `LocalStore.mutate` returns only after `atomicWriteJson` finishes, so enqueue / transaction / weighment / sync acknowledgements are persist-before-ack. A restart must not lose queued business events that were acknowledged as stored. Incomplete temp files can be recovered via `.bak` when the main file is missing.

**Hardware recommendation:** install a UPS or industrial power backup on the Edge PC and perform a safe OS shutdown when power is failing. This project does not implement electrical power control and does not claim protection against physical hardware damage.

## Offline states

Connectivity uses hysteresis (default: 3 failures to leave ONLINE, 2 successes to leave RECOVERING). One failed request does not flip the gateway offline.

| State | Meaning |
| --- | --- |
| ONLINE | Backend reachable and core sync is healthy |
| DEGRADED | Intermittent failure, or backend up while hardware/internet is not |
| OFFLINE | Backend unreachable after the failure threshold |
| RECOVERING | Backend just returned; critical events still outstanding |
| SYNCING | A batch is in flight |
| ERROR | Authentication or other permanent gateway error |

These are **not** collapsed into one “system online” flag. The dashboard reports separately:

- Internet: ONLINE / OFFLINE
- Backend: REACHABLE / UNREACHABLE
- Hardware: ONLINE / OFFLINE
- Sync: IDLE / SYNCING / ERROR

## Event queue

Each queued event has `eventId`, `gatewayId`, `deviceId`, `eventType`, `payload`, `eventTimestamp`, `receivedAt`, `status`, `retryCount`, `lastAttemptAt`, `nextRetryAt`, `syncedAt`, `failureReason`, plus `priority`, `dependsOn`, and `payloadHash`.

Statuses: `PENDING`, `SYNCING`, `SYNCED`, `FAILED`, `DEAD_LETTER`.

Priority:

- CRITICAL — official weighment, transaction state
- HIGH — ANPR, documents, local anomalies
- NORMAL — device status
- LOW — telemetry

Recovery sends higher-priority business events first. Low-priority telemetry is never allowed to evict a business event.

## Idempotency

`eventId` is unique. Retrying after a lost response, Edge restart, or store reopen must yield one business transaction / weighment / document / completion.

Acknowledgements:

- `ACCEPTED`
- `ALREADY_PROCESSED`
- `CONFLICT`
- `REJECTED`
- `DEPENDENCY_PENDING`

## Event ordering

Business events that share a local transaction keep explicit `dependsOn` links (create → ANPR/document/gross → tare → completion). If a prerequisite is missing, the event stays pending. It is not discarded.

## Local transaction context

Minimum fields only: local id, vehicle number if known, weighbridge/site, local state, gross/tare/net if captured, event references.

Offline ids are collision-resistant per gateway and day:

`TRINETRAEDGE01-20260920-000123`

The central backend maps that id to a normal Trinetra transaction. Auto-increment integers are not used as the public offline identity.

## Offline weighments

Gross and tare require a **stable** local reading. Net weight uses the same three-decimal milligram arithmetic as Step 9. Tare exceeding gross is rejected locally.

Operator copy:

- After local save: “Gross weight saved locally. Waiting for synchronization.”
- Never “Successfully uploaded” until the backend acknowledges the event
- After ACK: treated as synchronized
- Local completion is `LOCAL_COMPLETED` until the backend maps it to `CENTRAL_COMPLETED`

## Offline approvals

Approvals are **blocked** by the default site policy. If a visit needs central authorization, the Edge pauses it (`PAUSED_APPROVAL`) and explains why. RBAC is not weakened for offline mode.

## Offline ANPR and documents

Local ANPR and scanner capture continue when those devices are connected.

Vehicle lookup uses only the **site-scoped cached** vehicle list from the last successful bootstrap. If the plate is not in that cache, the operator is told that manual confirmation is required after sync.

Documents are stored on the Edge with `fileId`, hash, MIME type, size, and sync status. The Edge does not claim that central OCR completed. File upload is idempotent on content hash.

## Offline weight anomaly detection

Step 16 rules continue locally using the cached thresholds. An empty platform reporting 850 kg creates a local anomaly event immediately. After sync, the central `WeightAnomalyEvent` is created with `sourceEventId = eventId` so the same detection is not alerted twice.

## Synchronization engine

`POST /api/v1/edge/sync/batch` (gateway authenticated) accepts 1–50 events.

The engine:

1. Detects connectivity
2. Authenticates with the existing gateway token
3. Uploads pending files
4. Selects pending events by priority and dependency
5. Sends a controlled batch
6. Applies acknowledgements
7. Retries with exponential backoff
8. Moves permanently failed events to dead letter
9. Reports snapshot stats on heartbeat

Retry parameters are configurable (`EDGE_MAX_RETRIES`, `EDGE_RETRY_BASE_MS`, `EDGE_RETRY_MAX_MS`, `EDGE_SYNC_BATCH_SIZE`).

## Dead letter

Business events are never silently deleted. Dead-letter records keep the event id, error, retry count, first/last failure, payload reference, and a recommended action. `sync.manage` users can inspect them on **Offline & Synchronization**.

## Conflicts

If the Edge says `LOCAL_COMPLETED` and the central transaction is `REJECTED`, `CANCELLED`, or `EXCEPTION`, synchronization of that visit stops and an operational alert is raised.

No automatic overwrite is applied. An authorized user acknowledges or records a resolution note. Corrections still go through the existing audit/correction workflow.

## Configuration cache

Bootstrap returns a versioned cache: site, weighbridges, devices, anomaly thresholds, offline policy, and a bounded vehicle list.

If the cache is older than `maxConfigAgeHours` (default 24):

> Configuration refresh required.

Official local recording, completion, and anomaly evaluation do not continue on stale rules.

## Offline policy

Configurable per organization/site. Development default:

Allowed: weight read, ANPR, document capture, basic transaction recording, local anomaly detection.

Conditional: transaction completion (blocked when approval is required), material verification.

Blocked: approvals, configuration changes, user management, hardware configuration changes.

## Security

- Existing gateway bearer authentication
- Site isolation and RBAC (`sync.read`, `sync.manage`)
- No central admin passwords on the Edge
- Payload secret stripping unchanged
- File integrity via SHA-256
- Official local weighments are not silently editable; corrections use the central correction workflow

## Recovery workflow

1. Detect connectivity
2. Verify `/health`
3. Authenticate
4. Enter RECOVERING
5. Synchronize critical events
6. Verify acknowledgements
7. Synchronize remaining events
8. Upload documents
9. Record conflicts / dead letters
10. Return ONLINE only when core sync is healthy

## Operator and management UI

- Local operator console: `http://127.0.0.1:4100/operator` (works while the cloud API is down)
- Management page: `/weighbridge/sync`
- Weighbridge and arrival pages show an offline banner from the last reported snapshot

## Power and capacity

Queue and storage limits are enforced. Approaching the configured store size raises an alert. Critical events are not deleted to make room for telemetry.

## Known limitations

- The Edge is not a second ERP, user directory, or approval server
- Local authentication of human approvers is not implemented
- Local OCR is not implemented
- The store is a single-node atomic file, not a clustered database
- ERP connectors, OTA, barriers, PLC writes, and camera fraud features are out of scope (later steps)

## Demo flow

1. Start API, Edge, and web
2. Confirm ONLINE on `/weighbridge/sync` and `http://127.0.0.1:4100/operator`
3. Create a local visit and capture ANPR + gross
4. `POST /simulate/disconnect-backend`
5. Capture tare, compute net, generate a local empty-platform anomaly
6. Confirm the operator banner and queued events
7. Restart the Edge process — queued events remain
8. `POST /simulate/reconnect-backend`
9. Confirm `ACCEPTED` / `ALREADY_PROCESSED`, no duplicate transactions, dashboard and audit updates
