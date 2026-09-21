# Webhooks

Organizations configure HTTPS endpoints on an integration application. Trinetra records business events in an outbox, then delivers them asynchronously.

Failed delivery never fails the originating transaction.

## Configuration

Fields: webhook id, organization, integration, URL, status (`ACTIVE` | `DISABLED` | `REVOKED`), event subscriptions, encrypted signing secret, timestamps.

Production URLs must be HTTPS without credentials in the URL. Private/loopback hosts are blocked in production (SSRF control). Non-production allows HTTP and private hosts so local tests can run.

## Event types

Only events that already exist as audit actions are published:

- TRANSACTION_CREATED
- TRANSACTION_IDENTIFIED (from `VEHICLE_IDENTIFIED`)
- DOCUMENT_VERIFIED
- APPROVAL_REQUIRED / APPROVAL_COMPLETED
- UNLOADING_STARTED / UNLOADING_COMPLETED
- SECOND_WEIGHMENT_COMPLETED
- TRANSACTION_COMPLETED / TRANSACTION_EXCEPTION
- WEIGHT_ANOMALY
- DEVICE_STATUS_CHANGED
- WEBHOOK_TEST (explicit test button; payload is marked `test: true` and does not include fabricated production transactions)

## Signing

Headers:

- `X-Trinetra-Signature`: `sha256=<hex>` HMAC-SHA256 of `timestamp.eventId.rawBody` using the webhook secret
- `X-Trinetra-Timestamp`: Unix epoch milliseconds
- `X-Trinetra-Event-Id`
- `X-Trinetra-Event-Type`
- `X-Trinetra-Delivery-Id`
- `X-Correlation-Id` when present

Secrets are never included in the JSON body. Rotate the secret from the Integrations UI. Receivers should reject signatures that fail `timingSafeEqual` and timestamps older than five minutes (`webhookTimestampIsFresh`) to limit replay.

## Delivery and retry

Statuses: PENDING, DELIVERING, DELIVERED, FAILED, DISABLED.

Retry backoff: 15s, 1m, 5m, 15m, 1h, 6h. Maximum **6** attempts, then the delivery stays FAILED with no further retry (dead-letter). The worker does not retry forever.

Redirects are refused. Timeout defaults to 10 seconds (`INTEGRATION_WEBHOOK_TIMEOUT_MS`).

## Test events

“Send test event” writes a `WEBHOOK_TEST` outbox row with `isTest: true` and a fixed message that it is not a production transaction.

Related: [integration-platform.md](./integration-platform.md).
