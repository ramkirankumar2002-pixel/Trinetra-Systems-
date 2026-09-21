# Driver Mode — multilingual guided weighbridge UI

**Audience:** operators, drivers, and developers extending voice or languages  
**Status:** Step 18  
**Related:** [architecture.md](./architecture.md), [offline-first.md](./offline-first.md)

Driver Mode is a simplified front end for the existing weighbridge transaction. It does not replace authentication, RBAC, the transaction state machine, weighbridge/ANPR/OCR providers, approvals, unloading, or offline sync.

---

## 1. How to open it

Signed-in users with `driver.mode` open **Driver mode** from the Weighbridge module (`/weighbridge`) or home. The route is `/weighbridge/driver`.

There is no second login. The same session cookie is used. Store officers and other office roles do not receive `driver.mode` unless an administrator assigns it.

Seeded roles that include the permission: Administrator, Weighbridge Operator, Supervisor.

---

## 2. Architecture

```text
Driver UI (large-button screens)
   ↓ translations (en / hi / te)
   ↓ voice service
        ├─ speech-to-text provider (local browser or simulated)
        └─ text-to-speech provider (local browser or simulated)
   ↓ existing transaction / ANPR / document / weighment / unloading APIs
   ↓ existing audit log
```

The UI maps `transaction.nextAction` and `transaction.status` to driver screens. Business rules stay in `workflowEngine.ts` and the transaction service.

---

## 3. Languages

Central catalogs live in `apps/web/src/modules/driver/translations.ts`.

| Code | Language |
| --- | --- |
| `en` | English |
| `hi` | Hindi |
| `te` | Telugu |

`translate(locale, key)` falls back to English when a locale is unknown. Add a language by:

1. Extending `DRIVER_LOCALES` on web and `apps/api/src/domain/driverConfig.ts`
2. Adding a complete catalog (or spreading English and overriding keys)
3. Listing the code in `DRIVER_LANGUAGES`

Do not hard-code driver-facing copy in components.

---

## 4. Voice providers

Interfaces:

- `SpeechToTextProvider` — `listen()` → `{ transcript, intent, confidence, uncertain, unavailable }`
- `TextToSpeechProvider` — `speak(text, locale)` / `stop()`

Default factory:

1. Use the browser Web Speech API when present (local, not a paid cloud API)
2. Otherwise use simulated providers

Supported intents only:

`START_TRANSACTION`, `CONFIRM`, `CANCEL`, `RETRY`, `SCAN_DOCUMENT`, `NEXT`, `BACK`, `HELP`, `COMPLETE_UNLOADING`

Unknown or low-confidence speech shows **Please repeat**. Buttons always work. Voice must never be the only way to finish a step.

To add a real provider later, implement the two interfaces and pass them into `createVoiceService`. Do not rewrite the driver screens.

---

## 5. Driver screens

| Screen | Existing signal |
| --- | --- |
| Language | local preference not chosen yet |
| Vehicle | `nextAction = identify` or no transaction |
| Document | `upload_document` |
| Material | `assign_material` / `verify_material` |
| First weighment | `record_gross` |
| Approval | `await_approval` |
| Unloading | `assign_unloading` / `start_unloading` |
| Unloading in progress | `complete_unloading` |
| Second weighment | `record_tare` / `finalize` |
| Completed | `completed` / `COMPLETED` |
| Exception | `EXCEPTION`, `REJECTED`, `ON_HOLD`, `blocked`, `review_exception` |

Optional document skip is allowed only when `upload_document` is not blocking. Required document verification, material review, and approvals still wait for the responsible officer. Driver Mode never shows Approve / Reject.

Progress strip: Vehicle → Document → Weigh → Approval → Unload → Final Weigh → Complete.

---

## 6. Permissions

| Permission | Purpose |
| --- | --- |
| `driver.mode` | Open Driver Mode and call `/api/v1/driver/*` |
| Existing action permissions | Still required (`transaction.create`, `weighment.record`, `document.upload`, `unloading.manage`, …) |

Driver Mode hides user, workflow, hardware, material-master, and audit administration.

---

## 7. APIs added

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/driver/context` | Config, weighbridges, open site transactions |
| `POST` | `/api/v1/driver/events` | Whitelisted driver audit events |

Workflow actions continue to use the existing transaction, camera, document, and weighbridge routes.

---

## 8. Configuration

Environment (see `apps/api/.env.example`):

- `DRIVER_MODE_ENABLED`
- `DRIVER_DEFAULT_LANGUAGE`
- `DRIVER_LANGUAGES`
- `DRIVER_VOICE_ENABLED`
- `DRIVER_AUDIO_ENABLED`

Operator language, voice, and audio toggles are stored in `localStorage` (`trinetra.driver.prefs`). The active transaction id is stored in `sessionStorage` so a second transaction cannot be opened silently.

---

## 9. Offline

Driver Mode reads the existing `/api/v1/sync` snapshot. Tones: ONLINE, OFFLINE (saved on device), SYNCING, SYNCED, ERROR.

If the API is unreachable, the banner shows offline. Approvals and finalization stay blocked while offline. Weight validation, authorization, and transaction integrity remain server-side. Voice falls back to buttons when recognition is unavailable.

---

## 10. Errors and audit

Driver-facing errors are mapped in `friendlyDriverErrorKey`. Technical detail stays in the browser/API logs.

Driver events write to the existing `AuditLog` table (`DRIVER_MODE_OPENED`, language/voice/unloading/completion/exception, …). Transaction mutations still emit their original audit actions.

---

## 11. Non-goals (unchanged)

No paid speech APIs, ERP, ML, camera fraud, restricted-zone, CCTV analytics, traffic-light/barrier/PLC control, mobile driver app, or messaging integrations.
