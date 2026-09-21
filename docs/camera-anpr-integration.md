# Camera and ANPR integration foundation

Step 13 adds a camera capture layer and a vendor-neutral ANPR layer in front of the existing vehicle register and `ARRIVED → IDENTIFIED` transaction path.

ANPR is a signal. It is not identity proof.

## Architecture

```
Camera provider  →  frame/image  →  ANPR provider  →  normalized plate
                                                 ↓
                                    vehicle lookup (existing Vehicle APIs)
                                                 ↓
                                    operator confirm / correct / manual
                                                 ↓
                                    existing createArrival / identifyTransaction
```

Capture and recognition are separate. A camera does not identify a vehicle. ANPR does not create a transaction.

## What this step does not include

- Real camera hardware deployment
- A specific camera manufacturer SDK
- OpenALPR, Plate Recognizer, AWS Rekognition, Azure, or Google adapters
- Barrier or traffic-light control
- CCTV management
- Face or biometric identification
- Site-wide vehicle tracking
- Invoice OCR cross-check (Step 14)

Physical connection types (`RTSP`, `HTTP_SNAPSHOT`, `LOCAL`) can be stored. The foundation does not open those connections. Development uses the simulator.

## Camera

A camera belongs to one organization, site, and weighbridge.

Purposes:

- `ENTRY_ANPR` (this step)
- `EXIT_ANPR`
- `GENERAL_MONITORING`

Statuses: `CONNECTED`, `DISCONNECTED`, `CONNECTING`, `ERROR`, `DISABLED`.

Configuration existing is not the same as a live camera. Status comes from the connection manager.

Credentials are rejected by the API. Stored URLs have userinfo stripped. Responses never include passwords.

## ANPR

`IAnprProvider` supports `initialize`, `recognize`, `getStatus`, and `shutdown`.

Statuses: `READY`, `PROCESSING`, `ERROR`, `UNAVAILABLE`.

Camera connected and ANPR ready are independent.

Normalized result fields:

- raw plate
- normalized plate
- confidence
- confidence band
- candidates
- provider
- timestamp
- optional country/region and bounding box
- processing duration
- evidence storage key (not image bytes)

## Confidence

Thresholds are configurable per camera and by environment:

- `ANPR_HIGH_CONFIDENCE_MIN` (default `0.90`)
- `ANPR_MEDIUM_CONFIDENCE_MIN` (default `0.70`)

These are product settings, not an industrial standard.

| Band   | Operator path                                      |
|--------|----------------------------------------------------|
| HIGH   | Lookup may run automatically. Operator still confirms. |
| MEDIUM | Operator must confirm.                             |
| LOW    | Operator must correct or enter the number.         |
| NONE   | Manual entry.                                      |

Low-confidence candidates are never selected automatically.

## Plate normalization

Safe operations only:

- uppercase
- trim
- collapse display spaces
- remove separators for the search key

Visually similar characters are not rewritten. `O` is not turned into `0`. The raw detection and the normalized search key are stored separately.

## Vehicle lookup

After a plate is available the existing Vehicle table is searched.

- Match → show type, transporter, status, and recent visits when authorized
- No match → “Vehicle not registered”
- Vehicles are not created from uncertain ANPR
- Authorized users can register through the existing vehicle APIs, then confirm

## Transaction states

No new public transaction statuses.

Identification still writes `IDENTIFIED` through `createArrival` / `identifyTransaction`.

ANPR has its own lifecycle on `AnprDetection`:

`DETECTED` → `MATCHED` / `NO_MATCH` / `CONFIRMATION_REQUIRED` → `CONFIRMED`

or `DETECTED` → `CORRECTED` → `CONFIRMED`

or `DETECTED` → `REJECTED`

## Evidence and privacy

Frames are stored under `storage/anpr-evidence` with a storage key only.

- Authenticated, site-scoped frame download
- No public image URLs
- No unrestricted streams
- `ANPR_EVIDENCE_RETENTION_DAYS` is recorded for a later cleanup job (not implemented here)

## Notifications

Alerts are raised for:

- camera disconnect
- ANPR provider unavailable
- repeated ANPR failure
- unregistered vehicle
- manual identification required

Successful detections do not create notifications.

## Demo simulator

Default development stack:

`SIMULATED CAMERA` + `SIMULATED ANPR`

Scenarios:

1. High-confidence known vehicle (`AP39XX1234`)
2. Medium-confidence known vehicle (`MH12AB1234`)
3. Low-confidence detection
4. Unknown vehicle (`KA01ZZ9999`)
5. No plate
6. Multiple candidates
7. Operator correction
8. Manual vehicle entry

Simulator output is labeled `SIMULATED`.

## Real-world limits

Accuracy depends on camera angle, lighting, plate condition, vehicle speed, cleanliness, resolution, placement, country/region format, image quality, and weather.

Operator confirmation and manual entry must remain available.

## APIs

`/api/v1/cameras`

- create, list, get, update
- enable / disable
- test connection
- status
- recognize
- get detection
- correct / confirm / reject
- manual identify

Existing `POST /api/v1/weighbridges/:id/anpr/simulate` remains for Steps 5–6.

Site-side camera events can also arrive from the Edge Gateway (`DEVICE_ANPR_DETECTION`). Identification, confirmation, and transaction association stay in this API. See [edge-gateway.md](./edge-gateway.md).

No manufacturer camera API is registered. See [hardware-information-required.md](./hardware-information-required.md).
