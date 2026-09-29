# 0013: Webhooks: transactional outbox, Stripe-style signatures, SSRF checks at delivery

- **Status:** accepted
- **Date:** 2026-09-29

## Context
Tenants want envelope events in their own systems (ERP, CRM, storage). Events must not be lost or
invented: an event for a change that rolled back is as bad as a missing one. Receivers need to
authenticate requests. And a URL chosen by a tenant is an SSRF vector into our network (including
the cloud metadata service).

## Decision
- **Outbox:** `WebhookDelivery` rows are written in the same transaction as the state change and
  enqueued after commit. A sweep re-enqueues anything committed but never queued. BullMQ job ids =
  delivery ids, so re-enqueueing is idempotent. The payload is a snapshot from inside that
  transaction.
- **Signing:** `Sahihi-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "t.body")>` (the Stripe
  scheme receivers already know), with a 5-minute tolerance. The event id is stable across retries
  for de-duplication.
- **Secrets:** generated server-side and shown once. They must be recoverable to sign, so they're
  encrypted (AES-256-GCM, HKDF from `BETTER_AUTH_SECRET`), not hashed. No new env var.
- **SSRF:** syntactic URL checks on save, and DNS answers checked against private ranges before
  every attempt. Redirects are not followed. There's a dev/test-only escape hatch.
- **Retries:** 10 attempts over about 2 days; the last one marks the delivery FAILED. Retry is manual
  afterwards.
- **Access:** `webhook:manage` for owners and admins only.

## Consequences
- An extra table write per subscribed endpoint inside state-change transactions. It's skipped
  entirely when the org has no matching endpoint.
- Rotating `BETTER_AUTH_SECRET` breaks stored webhook secrets; they must be rotated too
  (documented).
- DNS rebinding between the check and the connection is still possible. Pinning the connection to
  the checked IP (a custom dispatcher with SNI) is the follow-up if we need it.
- `envelope.completed` is emitted by finalize, so it can lag the last signature by the finalize
  duration.
