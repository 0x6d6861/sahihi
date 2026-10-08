# Public API

A versioned REST API under **`/api/v1`** for a customer's own systems (ADR 0017). It shares
envelope logic with the web app through `@sahihi/envelopes`, so quotas, state transitions, audit
events and webhooks behave identically. Code: `apps/api/src/routes/v1.ts`,
`apps/api/src/middleware/api-key.ts`, `packages/core/src/integrations/{api-keys,public-api}.ts`.

## API keys

Owners and admins manage keys under **Settings → API** (`api:manage` permission,
`/api/api-keys`).

- Format `sahihi_sk_<43 base64url chars>`. The key is shown **once**. The database stores
  `sha256("api-key:" + key)` and a hint (`sahihi_sk_EyaE…lqdM`); the raw key is never stored or logged.
- Keys belong to the **workspace** and remember who created them. Requests act as that user in the
  audit trail, with `{ via: "api", apiKeyId }` in the event data.
- **Scopes** (pick the fewest):

  | Scope | Allows |
  |---|---|
  | `documents:read` | `GET /documents/:id` |
  | `documents:write` | `POST /documents` |
  | `templates:read` | `GET /templates` |
  | `envelopes:read` | list/get envelopes, downloads, bulk-send status |
  | `envelopes:write` | create/send/void envelopes, bulk sends, embedded signing URLs |

- Optional expiry: never, 30, 90 or 365 days. Revoking is immediate and permanent.
  At most 20 active keys per workspace.
- `lastUsedAt` is updated at most once a minute.

## Authentication and errors

```http
Authorization: Bearer sahihi_sk_…
```

| Status | When |
|---|---|
| 401 `unauthorized` | Missing, malformed, unknown, revoked or expired key (`WWW-Authenticate: Bearer`) |
| 403 `insufficient_scope` | The key lacks the route's scope (`required` names it) |
| 404 | Not found **or** belongs to another workspace |
| 402 `quota_exceeded` | Plan's monthly envelopes used up (docs/billing.md) |
| 409 | Illegal state change (e.g. sending a sent envelope) |
| 429 | Rate limited: 600 requests/min per key, 1200/min per IP |

Error bodies are `{ "error": "<code>", "message": "…" }`, plus `issues` on validation errors.

## Endpoints

| Method & path | Scope | Notes |
|---|---|---|
| `GET /api/v1` | any | Who am I: `{ organization, key: { id, name, scopes } }` |
| `POST /documents?name=nda.pdf` | `documents:write` | Body is the raw PDF (`Content-Type: application/pdf`), max 25 MB. 201 `{ document }` |
| `GET /documents/:id` | `documents:read` | |
| `GET /templates` | `templates:read` | With roles (ids + labels), for create-from-template and bulk send |
| `GET /envelopes?status=&page=` | `envelopes:read` | Paged, 50 per page |
| `POST /envelopes` | `envelopes:write` | From a document **or** a template (below). `send: true` sends straight away |
| `GET /envelopes/:id` | `envelopes:read` | Same shape as webhook `data.envelope`, plus `purged` |
| `POST /envelopes/:id/send` | `envelopes:write` | |
| `POST /envelopes/:id/void` | `envelopes:write` | `{ reason }` |
| `GET /envelopes/:id/downloads` | `envelopes:read` | Presigned URLs for the signed PDF and certificate once `COMPLETED` |
| `POST /bulk-sends` | `envelopes:write` | docs/bulk-send.md |
| `GET /bulk-sends/:id` | `envelopes:read` | |
| `POST /envelopes/:id/recipients/:recipientId/signing-url` | `envelopes:write` | docs/embedded-signing.md |

### Creating an envelope

`documentIds` lists the documents to sign, in order (up to 10). `documentId` still works and
means one document. Each field may set `document`, a 0-based index into `documentIds` (default 0);
its `page` is within that document. Envelope responses and webhook payloads list `documents[]`
(each with `sha256` and `signedSha256`) and `attachments[]`, and keep `document` / `signedSha256`
as the first document's for older integrations (ADR 0037).


From an uploaded document. Fields reference recipients **by index**, and coordinates are normalized
0–1 with a top-left origin (docs/coordinates.md):

```json
{
  "documentId": "…",
  "title": "NDA",
  "signingOrder": "PARALLEL",
  "recipients": [
    { "name": "Amina Hassan", "email": "amina@example.com" },
    { "name": "Customer", "email": "c@example.com", "delivery": "EMBEDDED" }
  ],
  "fields": [
    { "recipient": 0, "type": "SIGNATURE", "page": 1, "x": 0.1, "y": 0.8, "width": 0.3, "height": 0.06 }
  ],
  "send": true
}
```

From a template (roles by id from `GET /templates`):

```json
{ "templateId": "…", "title": "Lease", "recipients": [{ "roleId": "…", "name": "…", "email": "…" }], "send": true }
```

Follow progress with webhooks (docs/webhooks.md) rather than polling.

## Not in v1

- OAuth apps / acting on behalf of other workspaces.
- Idempotency keys. Retry a failed `POST` only after checking `GET /envelopes`.
- Editing drafts field by field; create the envelope complete in one call.
