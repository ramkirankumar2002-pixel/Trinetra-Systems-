# API versioning

## Current version

Trinetra’s HTTP API is **v1**, mounted at `/api/v1`. The integration platform uses the same version (`currentVersion` `1.0` in the integration catalog).

There is no `/api/v2`.

## Strategy

- Public and session routes are prefixed with `/api/v1/...`.
- Additive changes (new fields, new endpoints) stay in v1 when they do not break existing clients.
- Breaking changes require a new prefix such as `/api/v2` and a documented deprecation window on v1.
- The React app continues to call existing `/api/v1` session routes. Those routes were not moved.

## Backward compatibility policy

- Existing frontend calls must keep working.
- Integration routes were added at `/api/v1/ext` and `/api/v1/integrations`. They do not replace session routes.
- JSON field removals or type changes on existing session responses are treated as breaking.
- Unknown JSON properties on write requests may be ignored; required fields still validate.

## Deprecation approach

1. Mark the old behavior in docs and, where practical, in the OpenAPI file.
2. Keep the old route serving for at least one production release.
3. Introduce the replacement under the same `/api/v1` path only if it is strictly additive; otherwise use a new version prefix.
4. Remove the old route only after callers have moved.

## Integration vs session APIs

| Surface | Prefix | Auth |
| --- | --- | --- |
| Session UI/API | `/api/v1/*` except `/ext` | Session cookie JWT |
| Integration admin | `/api/v1/integrations` | Session cookie + `integration.read` / `integration.manage` |
| External systems | `/api/v1/ext` | Integration secret |

Error envelopes differ: session APIs return a string `error`; external APIs return `error.code` + `error.message`. Clients must not assume one shape for both.

Related: [integration-platform.md](./integration-platform.md).
