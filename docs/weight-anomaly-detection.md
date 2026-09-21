# Weight anomaly detection

Step 16 adds a rule-based engine that watches **normalized weighbridge readings** and records abnormal measurement patterns.

Weight anomaly detection identifies abnormal measurement behavior. It does not independently prove fraud or physical tampering.

A human or authorized operator determines the cause. The software must never claim “Fraud detected” or “Load-cell wire was cut.” Weight data alone cannot prove the physical cause.

**Audience:** operators, supervisors, and developers  
**Related:** [hardware-integration.md](./hardware-integration.md), [edge-gateway.md](./edge-gateway.md), [notifications.md](./notifications.md)

---

## Architecture

```text
Weighbridge
    ↓
Weight indicator
    ↓
Edge Gateway (basic packet/numeric validation only)
    ↓
Normalized weight reading
    ↓
WeightAnomalyEngine (central rules)
    ↓
Rule evaluation
    ↓
Security / operational event
    ↓
Alert + notification
    ↓
Authorized user
```

The engine consumes the existing hardware abstraction (`IWeightProvider` / `NormalizedWeightReading`). It works with the simulator, a real indicator, and future providers. It does **not** read raw load-cell electrical signals.

Camera, ANPR, CCTV, person detection, object detection, restricted-zone logic, and visual evidence are **not** used.

---

## Anomaly types

| Type | Meaning |
| --- | --- |
| `EMPTY_PLATFORM_WEIGHT` | Platform state is explicitly `EMPTY` and weight exceeds the empty-platform threshold. Low weight alone does not mean empty. |
| `SUDDEN_WEIGHT_CHANGE` | Rate of change exceeds the configured kg/s limit while the platform was expected to be stable. |
| `WEIGHT_JUMP` | Consecutive valid readings differ by more than the jump threshold. |
| `REPEATED_INSTABILITY` | `UNSTABLE` readings continue beyond the configured duration/count. |
| `NEGATIVE_OR_INVALID_WEIGHT` | Negative, corrupt, invalid-unit, or device-error readings. |

Future-ready detector slots exist for statistical and ML models (`STATISTICAL`, `ML`). Step 16 implements **deterministic RULE detectors only**.

Every confirmed event includes an explanation, for example:

> Weight increased from 120 kg to 850 kg within 3 seconds while platform state was EMPTY.

---

## Configurable thresholds

All thresholds are stored per weighbridge in `WeightAnomalyConfig`. Seeded values are labeled **DEVELOPMENT DEFAULT**. Production values must be configured and validated for the actual weighbridge.

| Parameter | DEVELOPMENT DEFAULT |
| --- | --- |
| Empty platform threshold | 50 kg |
| Maximum change per second | 2000 kg/s |
| Weight jump threshold | 3000 kg |
| Maximum instability duration | 8000 ms |
| Minimum anomaly duration | 800 ms |
| Consecutive anomaly count | 2 |
| Cooldown after recovery | 120000 ms |
| Sudden-change window | 3000 ms |
| Suppress alerts in maintenance | true |

Only users with `anomaly.configure` can change thresholds. Changes are audited with old value, new value, user, timestamp, and reason.

Ordinary weighbridge operators cannot change security-sensitive thresholds.

---

## Platform states

Derived from existing maintenance windows and open transactions. No duplicate state machine.

| State | Typical condition |
| --- | --- |
| `EMPTY` | No open transaction and not in maintenance |
| `WEIGHING` | Open inbound/outbound weighment workflow |
| `UNLOADING` | Transaction status `UNLOADING` |
| `WAITING_FOR_TARE` | Approved / unloaded, waiting second weighment |
| `VEHICLE_PRESENT` | Open hold / exception / rejected visit |
| `MAINTENANCE` | Active `MaintenanceEvent` |
| `UNKNOWN` | Weighbridge context missing |

Normal truck movement during `WEIGHING` does not by itself create an empty-platform event.

---

## Severity

`INFO` · `WARNING` · `ERROR` · `CRITICAL`

Examples:

- Minor unexpected empty-platform weight → `WARNING`
- Repeated instability → `WARNING` or `ERROR`
- Large weight jump → `ERROR` or `CRITICAL`
- Large abnormal empty-platform weight → `ERROR` or `CRITICAL`

CRITICAL is not assigned to every anomaly.

---

## Event lifecycle

```text
Detected → OPEN
        → ACKNOWLEDGED → RESOLVED
        → FALSE_POSITIVE
```

Recovery of the measurement condition is recorded (`recoveredAt`, duration, timeline) but the event is **not** deleted. Operators still review, acknowledge, resolve, or mark false positive.

Duplicate protection:

1. First confirmed condition → create one event + one alert
2. Condition continues → update the same event (occurrence count, min/max/average, last detected)
3. Condition returns to normal → mark recovered
4. Same condition returns after cooldown → create a new event

High-frequency readings are processed in memory. The main database stores the event, bounded timeline samples, and summary statistics — not every poll.

---

## Maintenance mode

If the weighbridge is in `MAINTENANCE`:

- Anomaly evaluation still runs
- Events are still recorded
- Alerts/notifications are suppressed when `suppressAlertsInMaintenance` is true
- The timeline records `SUPPRESSED`
- Maintenance start/end is audited

Security monitoring is not silently disabled.

---

## Alerts and RBAC

Reuse Step 11 operational alerts and in-app notifications (`WEIGHT_ANOMALY`). One notification/alert per anomaly event, not per reading.

| Role | Access |
| --- | --- |
| Weighbridge operator | View, acknowledge |
| Store / site | View relevant operational alerts |
| Management / supervisor | View, acknowledge, resolve, false positive, configure |
| Admin | Full access |

Backend permissions: `anomaly.read`, `anomaly.acknowledge`, `anomaly.resolve`, `anomaly.configure`.

False-positive marks require a reason and remain in the audit history.

---

## Edge integration

The Edge Gateway may reject invalid packets, invalid numeric readings, and communication errors. **Business anomaly rules stay on the backend** so they remain centrally configurable.

Flow:

```text
Weight indicator → Edge Gateway → DEVICE_WEIGHT_READING → backend ingest → WeightAnomalyEngine
```

The live simulator poller also feeds the same engine.

---

## Simulator scenarios

`POST /api/v1/weighbridges/:id/anomaly/scenario`

- `NORMAL_EMPTY` — 0, 2, 4, 3 kg
- `ZERO_DRIFT` — 2, 4, 6, 5 kg
- `EMPTY_ANOMALY` — 3, 4, 850, 860 kg
- `WEIGHT_JUMP` — 12 500, 12 510, 18 000 kg
- `REPEATED_INSTABILITY`
- `NEGATIVE` / `INVALID`
- `RECOVERY` — 850, 860, 4, 3 kg
- `MAINTENANCE_ABNORMAL`

---

## Security considerations and limitations

- No camera evidence, restricted-zone detection, or ANPR correlation
- No load-cell wire-cut diagnosis
- No automatic fraud classification
- Possible causes of an abnormal pattern include mechanical issues, vehicle movement, vibration, indicator problems, load-cell issues, electrical problems, unauthorized intervention, or unknown causes
- DEVELOPMENT DEFAULT thresholds are not industrial metrology values
- Future statistical/ML detectors can be registered beside the rule engine without rewriting it

---

## Demo APIs

- `GET /api/v1/anomalies` — paginated history
- `GET /api/v1/weighbridges/:id/weight-health`
- `POST /api/v1/weighbridges/:id/anomaly/scenario`
- `POST /api/v1/weighbridges/:id/maintenance/start|end`
- Dashboard section **Weight anomalies**
- Device page **Weight health**
- UI `/weighbridge/anomalies`
