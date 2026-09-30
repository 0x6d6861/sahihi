# 0017: Public API, bulk send and embedded signing share one envelope service

- **Status:** accepted
- **Date:** 2026-09-29

## Context
Customers want to send from their own systems (HR, property, lending), send one template to many
people, and let their users sign without leaving their site. The envelope rules (quota, state
machine, audit chain, webhook outbox, routing) lived inside the Hono route handlers, and the worker
needed the same logic for bulk sends.

## Decision
- **`@sahihi/envelopes` package** (config/core/db/infra) holds send, void, create-from-template,
  create-from-document, routing, bulk send and embedded links. Session routes, `/api/v1` and the
  worker all call it. Errors are a typed `EnvelopeError(status, code)` that `app.onError` maps.
- **Scoped API keys** (product owner's choice), workspace-owned, hash-only storage, shown once,
  optional expiry, revocable. `Authorization: Bearer`. Five scopes; `api:manage` permission
  (owner/admin) to manage them. Requests are attributed to the key's creator plus
  `{ via: "api", apiKeyId }`.
- **Bulk send via CSV upload and API** (product owner's choice), validated all-or-nothing, quota
  checked up front and again per send, processed by a worker job with a two-phase (create, then
  send) row loop so retries don't duplicate envelopes. Row PII is cleared once the envelope exists.
- **Embedded signing via iframe on allowed origins** (product owner's choice). Recipients get a
  `delivery` (`EMAIL` | `EMBEDDED`); embedded ones get no emails and a short-lived, rotating URL
  from the API. `frame-ancestors` is set per request by `proxy.ts` from an authoritative API lookup
  keyed by the token, so only embedded recipients' pages are framable and only by allowed origins.

## Alternatives considered
- Signed embed URLs with an HMAC shared between API and web: avoids the proxy lookup, but still
  needs the allowed origins at render time and adds a second secret to rotate.
- OAuth apps: needed for third-party integrations, not for a customer's own systems. Later.
- Bulk send as one big transaction: a single bad send would roll back hundreds of envelopes, and it
  would hold a transaction for minutes.

## Consequences
- Every public-API change needs a scope decision and a `tenant-isolation`-style test. `/api/v1` is
  excluded from the session-route classification test and covered by `public-api.itest.ts`.
- `/sign/<token>?embed=1` costs one extra API call per page load (2 s timeout, falls back to
  `frame-ancestors 'none'`).
- Embedded recipients must use link verification; the host app is responsible for having
  authenticated its user. That's recorded in the audit trail (`delivery: "embedded"`).
