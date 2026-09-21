# Operator guide (Trinetra Systems V1.0)

For weighbridge operators, store officers, and supervisors on a configured site.

## Sign in

Open the web application, enter email and password. Organization slug is optional when the email is unique across tenants.

Demo accounts (`*@demo.local`, password `demo-password`) are **development only**.

## Driver mode

Users with `driver.mode` open **Driver mode**. Large buttons, language selection (English / Hindi / Telugu), and optional local voice prompts guide:

1. Vehicle identification (simulated ANPR or typed plate)
2. Document capture
3. Material
4. Gross weighment
5. Approval wait (if the material workflow requires it)
6. Unloading
7. Tare weighment
8. Completion

Simulated weights and plates are labeled simulated. Do not treat them as legal-for-trade measurements.

## Weighbridge office UI

**Weighbridge → Arrival** follows the same business steps with more detail. **Transactions** shows history. **Approvals** is for store/supervisor decision makers.

## Type 1 / Type 2 / Type 3

These are **this organization’s workflow names** in the demo seed. Administrators can change them. They are not universal industry types.

- Demo Type 1: supervisor verification after first weighment
- Demo Type 2: store approval after first weighment
- Demo Type 3: auto-continue below an organization-specific threshold, otherwise approval

## Failures you should expect

| Situation | Expected behaviour |
| --- | --- |
| Unknown plate | Register or correct the vehicle; do not invent a plate |
| Document required | Transaction stays in document pending until upload/verify |
| Approval rejected | Transaction does not proceed to unload/complete |
| No unloading point | Assignment fails with a clear error |
| Tare above gross | Net calculation flags an invalid relationship |
| Weight anomaly | Inspection required; not a legal finding of fraud |
| Device/gateway unavailable | Simulator or last known status; do not record a fake live weight as real |

## Reports and audit

Office roles use **Reports** and **Dashboard**. Operators cannot delete audit records from the application.
