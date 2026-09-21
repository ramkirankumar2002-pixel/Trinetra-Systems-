# Customer onboarding and installation wizard

This guide is for an authorized **implementation engineer**. It does not grant every organization administrator onboarding access.

Onboarding configures an existing organization. It does **not** create a second RBAC, workflow, notification, or device-management system, and it does **not** onboard Organization B from Organization A.

## Prerequisites

- PostgreSQL is running and migrations are applied
- The implementation user has `onboarding.view`, `onboarding.create`, `onboarding.edit`, `onboarding.validate`, `onboarding.complete`, and `onboarding.cancel`
- Demo seed includes `implement@demo.local` / `demo-password` with those permissions only on the demo tenant
- Organization administrators do **not** receive onboarding permissions automatically
- Hardware protocol documentation is available before any non-simulator device is marked ready
- ERP integration and advanced AI/ML are out of scope for this step

## Organization setup

1. Open **Customer onboarding** and choose **Start or resume**.
2. Confirm organization name and organization code (slug). Codes are unique.
3. Optional contact name/email only. Do not collect extra personal information.
4. Set default driver language, enabled languages, voice, and audio. These reuse the existing driver-mode locales (`en`, `hi`, `te`).

Resuming a session never creates a duplicate organization.

## Site setup

Collect site name, site code, optional location, and timezone. The site must belong to the signed-in organization. If the code already exists in that organization, the wizard binds the existing site instead of creating another.

## User setup

Create or attach users with name, login identity (email), role, department, site, and optional weighbridge scope. Existing RBAC applies.

A temporary password is shown **once** to the implementation user. It is hashed immediately, never written to onboarding logs, and never returned by GET APIs.

## Hardware setup

Configure weighbridge, edge gateway, and devices through the existing hardware, gateway, and camera services.

- Weighbridge hardware mode is simulator until manufacturer protocol documentation is provided.
- Gateway registration issues a credential once (`tgw_…`). If the gateway is not online, the step stays incomplete and the UI shows **GATEWAY NOT CONNECTED**.
- Missing protocol details show **Protocol information required**. The wizard does not invent serial, TCP, or Modbus settings.
- Hardware tests check communication, weight/stability, ANPR, and scanner capture. They do **not** create production transactions.

## Workflow setup

Select an existing workflow, validate steps (identification, completion, approval departments), then publish. Only valid workflows can be published. Materials keep using the Step 27 assignment model.

## Validation

The validation engine checks organization, site, administrator, RBAC, weighbridge, gateway, devices, materials, published workflows, documents, unloading points, notification recipients, and driver language.

Results are **PASS**, **WARNING**, or **ERROR**. Examples:

- PASS: `Primary weighbridge configured.`
- WARNING: `ANPR camera is configured but currently offline.` / `GATEWAY NOT CONNECTED` in simulation or pilot
- ERROR: `No published workflow exists for material Cement.`

ERROR items must be resolved before completion. Warnings may be accepted when appropriate.

## Pilot testing

Pilot readiness does not claim hardware success unless a test actually ran. A controlled test transaction uses **PILOT** mode and the existing transaction service (`Vehicle → Document → Workflow → Gross → Approval → Unloading → Tare → Completion` as the site workflow requires).

## Completion

Complete onboarding only after every wizard step is done, validation has no errors, and remaining warnings are accepted. Cancelling a session does **not** delete customer data.

## Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| 403 on `/onboarding` | Role lacks onboarding permissions | Use an implementation engineer account; do not grant these to every admin |
| 404 for another organization's session | Tenant isolation | Stay inside the signed-in organization |
| GATEWAY NOT CONNECTED | No recent heartbeat | Restore gateway connectivity; do not mark the step complete |
| Protocol information required | Non-simulator device without documentation | Leave the device as simulator or supply protocol documentation |
| Cannot skip to materials | Previous mandatory steps incomplete | Complete organization → site → … in order |
| Duplicate site/org | Resume vs create | Resume the open session; existing codes are reused |
| Password visible in audit | Must never happen | If it does, treat it as a defect; current audits store email/role only |

APIs: `POST/GET /api/v1/onboarding`, `GET /api/v1/onboarding/:id`, `PATCH /api/v1/onboarding/:id/step`, `POST .../validate`, `GET .../validation`, `POST .../hardware-checks`, `POST .../readiness`, `POST .../pilot-test`, `POST .../complete`, `POST .../cancel`. All require authentication, onboarding RBAC, and organization/site scope.
