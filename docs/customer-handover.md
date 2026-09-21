# Customer handover (Trinetra Systems V1.0)

No passwords or secrets belong in this package.

## System overview

Trinetra Systems is a weighbridge operations application: identify the vehicle, capture documents, classify material, record weights, apply the organization’s workflow (including optional approval and unloading), then complete the transaction with a server-calculated net weight.

See `docs/architecture.md` and `docs/v1-feature-inventory.md`.

## Login and user setup

`docs/admin-guide.md`, `docs/operator-guide.md`. Users are not self-registered. V1.0 has no password-reset or MFA UI.

## Driver operation

`docs/driver-mode.md`, `docs/operator-guide.md`.

## Weighbridge operation

Arrival, devices, live weight panel. Simulator readings are labeled simulated.

## Store workflow and approvals

`/approvals`. Department permissions are enforced on the API.

## Maintenance and support

`docs/maintenance-management.md`, `docs/customer-support.md`, `/maintenance`, `/support`.

## Reports

`docs/reporting-analytics.md`, `/reports`.

## Integrations

`docs/integration-platform.md`, `docs/webhooks.md`, `docs/api-versioning.md`. Credentials and webhook secrets are shown once.

## Backup / recovery

`docs/backup-recovery.md`, `docs/restore-procedure.md`. Restore of a live customer database was **not** verified in the V1.0 freeze.

## Troubleshooting

`docs/troubleshooting-guide.md`.

## Contact / support process

Use in-app tickets for entitled users. Internal notes are not customer-visible. Escalation contacts are the customer’s implementation agreement — they are not stored as a public default in this repository.
