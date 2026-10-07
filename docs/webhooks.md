# Webhooks

Per-organization HTTPS endpoints that receive **signed JSON events** when envelopes change
(ADR 0013). Owners and admins manage them under **Settings → API** (Webhooks section).

## Events

| Type | When | Emitted by |
|---|---|---|
| `envelope.sent` | The sender sent the envelope | `POST /envelopes/:id/send` |
| `recipient.signed` | A recipient signed or approved (`data.recipientId`) | `POST /sign/:token/submit` |
| `envelope.completed` | Everyone signed **and** the signed PDF + certificate exist | finalize job |
| `envelope.declined` | A recipient declined (`data.recipientId`) | `POST /sign/:token/decline` |
| `envelope.voided` | The sender voided it | `POST /envelopes/:id/void` |
| `envelope.expired` | It expired unsigned | hourly expiry job |
| `webhook.test` | "Send test event" | `POST /webhooks/:id/test` |

`envelope.completed` fires after finalize, not at the last signature, so a receiver can fetch the
signed document straight away.

## Request

```http
POST <your URL>
Content-Type: application/json
User-Agent: Sahihi-Webhooks/1.0
Sahihi-Signature: t=1790665107,v1=d590…
Sahihi-Event-Id: evt_95bd8128835e4f25813f4a652df2d788
Sahihi-Event-Type: envelope.sent

{
  "id": "evt_95bd…",            // same on every retry: use it to de-duplicate
  "type": "envelope.sent",
  "createdAt": "2026-09-29T06:58:27.193Z",
  "organizationId": "…",
  "data": {
    "envelope": {
      "id", "title", "status", "signingOrder", "createdAt", "sentAt", "completedAt",
      "voidedAt", "voidReason", "document": { "id", "name", "sha256" }, "signedSha256",
      "certificateCode", "recipients": [{ "id", "name", "email", "role", "order", "status",
      "signedAt", "declinedAt", "declineReason" }]
    }
    // + "recipientId" for recipient.signed / envelope.declined
  }
}
```

`data` is a snapshot taken when the event happened. Respond with any **2xx within 10 seconds**. Do
slow work asynchronously.

## Verifying signatures

`v1` is the hex HMAC-SHA256 of `"<t>.<raw request body>"`, keyed with the endpoint's signing secret
(`whsec_…`). Always verify against the **raw** body before parsing it. The reference implementation
is `verifyWebhookSignature` in `packages/core/src/integrations/webhooks.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto"

function verify(header: string, rawBody: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")
  const given = Buffer.from(parts.v1 ?? "", "hex")
  return given.length === 32 && timingSafeEqual(given, Buffer.from(expected, "hex"))
}
```

## Delivery and retries

1. **Outbox.** `queueEnvelopeWebhook(tx, …)` (`@sahihi/db`) creates a `WebhookDelivery` per matching
   enabled endpoint **inside the transaction** of the state change. After commit, the caller runs
   `enqueueWebhookDeliveries(ids)` (`@sahihi/infra`, job id `whd-<deliveryId>`). The
   `webhooks.sweep` maintenance job (every 5 min) re-enqueues PENDING deliveries with no attempts
   that are older than 2 minutes, e.g. if the process died between commit and enqueue.
2. **Worker** (`apps/worker/src/jobs/webhooks.ts`):
   - Re-checks the URL and its DNS answers (`docs/security.md` → Webhooks).
   - Signs with a fresh timestamp and POSTs with a 10 s timeout, without following redirects.
   - Records the attempt: `attempts`, `lastStatusCode`, `lastError`, and `lastResponse` (trimmed).
3. A **2xx** response → `SUCCEEDED`. Anything else throws, and BullMQ retries on
   `webhookRetryDelayMs`: 30 s, 2 min, 8 min, 30 min, 1 h, then every 6 h, 10 attempts in all
   (about 2 days). The last failure → `FAILED`. Invalid or private URLs fail at once, without retries.
4. **Retry** (`POST /webhooks/:id/deliveries/:deliveryId/retry`) re-queues a FAILED delivery with the
   same event id. Pausing an endpoint stops new events, and queued ones fail without retrying.
   Deleting it removes its deliveries.

## API (`/api/webhooks`, owner/admin: `webhook:manage`)

| Route | |
|---|---|
| `GET /` | Endpoints with their latest 20 deliveries |
| `POST /` | `{ url, description?, events[] }` → 201 `{ endpoint, secret }`. Up to 10 per org |
| `PATCH /:id` | url, description, events, enabled |
| `DELETE /:id` | 204 |
| `POST /:id/rotate-secret` | → `{ endpoint, secret }`. The old secret stops working immediately |
| `POST /:id/test` | Queues `webhook.test` → 202 |
| `POST /:id/deliveries/:deliveryId/retry` | FAILED only → 202 |

Another org's ids get 404 (`tenant-isolation.itest.ts`). Members get 403.

## Local development

Endpoints must be public HTTPS. To test with a local receiver, start dev with
`WEBHOOKS_ALLOW_PRIVATE_URLS=true bun run dev` (never in production) and point the endpoint at
`http://127.0.0.1:<port>/…`. `apps/api/test/webhooks.itest.ts` does the same with `Bun.serve`.

## Not in v1

Auto-disabling endpoints that keep failing, signing with two secrets during a rotation grace
period, per-endpoint rate limits, and pinning the connection to the checked IP (DNS rebinding).
