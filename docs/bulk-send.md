# Bulk send

One template, many rows, **one envelope per row**, all sent straight away (ADR 0017). Used for
lease renewals, offer letters, policy acknowledgements. Code: `packages/core/src/bulk-send.ts`
(pure), `packages/envelopes/src/bulk-send.ts` (service), `apps/api/src/routes/bulk-sends.ts`,
worker job `bulk.send`.

## Inputs

- **Web:** Templates → **Bulk send** (`/templates/:id/bulk`). Upload a CSV, see every problem
  before anything is sent, preview the titles, send. Progress at `/bulk-sends/:id` (auto-refreshes).
  Any member who can use the template can bulk send.
- **API:** `POST /api/v1/bulk-sends` with `{ templateId, title, message?, rows }` (docs/public-api.md).
- Up to **500 rows** per batch (`BULK_SEND_MAX_ROWS`).

## CSV

Columns per template role that has no fixed contact: `<Role> name`, `<Role> email`, and
`<Role> phone` when that role uses SMS verification. With a single open role, plain `name` /
`email` / `phone` headers also work. **Download CSV template** writes the exact header.

`parseCsv` follows RFC 4180 (quotes, `""` escapes, commas and newlines inside quotes, CRLF/LF),
strips an Excel BOM, skips blank lines and accepts `;` separators when the header has no comma.

Each row is validated exactly like a single **Use template** (`draftFromTemplate`): names, emails,
duplicate emails within a row, phones for SMS roles. The browser validates first; the API validates
again. **All-or-nothing:** any invalid row → 400 with every issue (`{ path, row, message }`) and
nothing is created.

## Titles

`title` may contain placeholders: `Lease – {{Tenant name}}` → `Lease – Amina Hassan`. Available:
`{{<Role> name}}` and `{{<Role> email}}` for every role (fixed contacts too). Unknown placeholders
are left as typed.

## Quotas

Each envelope counts towards the plan (docs/billing.md). A batch larger than what's left this month
is refused **up front** (402). Each send still checks the quota, so a row can fail if someone else
used the last envelopes meanwhile. That row is marked `FAILED` with the message; the rest continue.

## Processing (worker)

`startBulkSend` stores the `BulkSend` and one `BulkSendItem` per row, then adds maintenance job
`bulk.send` (jobId `bulk-<id>`, so it's queued once). `processBulkSend`:

1. Marks the batch `RUNNING` and walks `PENDING` items in row order.
2. **Two phases per row:** creates the draft from the template and saves `envelopeId` on the item,
   then sends it. A retry after a crash sends the saved draft instead of creating a duplicate.
3. On success the item becomes `SENT`; on error `FAILED` with the message (max 500 chars).
4. Either way the row's `recipients` JSON is cleared: the people now live on the envelope, so the
   batch keeps only the outcome (docs/data-retention.md).
5. Marks the batch `DONE`.

Every envelope's `envelope.created` audit event carries `{ bulkSendId, row }`, and sends through
the API carry `{ via: "api", apiKeyId }`. Webhooks fire per envelope as usual.

Statuses: batch `PENDING → RUNNING → DONE`; item `PENDING → SENT | FAILED`.

## Not in v1

- Per-row field values (pre-filled text fields) and per-row messages.
- Scheduling a batch for later; cancelling a running batch.
