# Data retention, export and deletion

Kenya Data Protection Act 2019 (and GDPR-style) duties: keep personal data only as long as
needed, let the workspace take its data with it, and delete it on request (ADR 0015). Owners and
admins manage this under **Settings → Data** (`data:manage`).

## What "purging" an envelope does

| Deleted | Kept (evidence) |
|---|---|
| Signed PDFs (one per document), certificate PDF, signature/initials images, supporting files and the "Download all" zip (`org/<id>/envelopes/<envelopeId>/…`); supporting files are renamed "Deleted file" (ADR 0037) | Status, all timestamps, signing order |
| The original PDF and its thumbnail, once no other live envelope and no template uses it (the `Document` row is renamed "Deleted document" and soft-deleted; its `sha256` stays). Deleting a document from the Documents page removes its thumbnail at once (ADR 0033) | Each document's hash and `signedSha256`, supporting files' hashes, the `Certificate` row (code, hash) so `/verify/<code>` still answers |
| Recipients' names, emails (→ `deleted-<id>@redacted.invalid`), phones, signing IPs and user agents, decline reasons, OTP rows, link tokens | Recipient roles, order, statuses and `signedAt`/`viewedAt`/`declinedAt` |
| Field values and labels; envelope title and message; void reason | Field positions and types |
| Webhook delivery payloads for that envelope (→ `{ redacted: true }`); in-app notifications about it (deleted, docs/notifications.md) | The hash-chained **audit trail**, append-only (ADR 0010), plus an `envelope.purged` event with the reason |

The audit trail is kept as it is under the lawful-basis exception: it's the evidence that a
signature happened. Its rows can't be edited (ADR 0010), so personal data inside older audit
payloads (e.g. a decline or void reason) stays there.

`purgeEnvelope` (`apps/worker/src/jobs/retention.ts`) deletes files first, then redacts in one
transaction with the audit event, then removes the original if it's unused. It's idempotent
(`purgedAt`). Afterwards, downloads return **410** `purged`, and the envelope page shows a
"Files and personal data deleted" notice.

## Retention (automatic)

- `WorkspaceSettings.retentionYears`: **null = keep forever (default)**, or 1, 3, 7 or 10 years.
  `PUT /api/data/settings`.
- The `retention.sweep` job (daily 02:30 Nairobi) queues `envelope.purge` for closed envelopes
  (COMPLETED, DECLINED, VOIDED, EXPIRED) that closed before the cutoff. "Closed" = `completedAt`,
  else `voidedAt`, else `updatedAt` for declined/expired (`closedAt`). Drafts and open envelopes
  are never purged.

## On request

`POST /api/envelopes/:id/purge` (owner/admin, closed envelopes only) queues the same purge now,
e.g. for a data subject's erasure request. It's the "Delete data" button on the envelope page.

## Export

- `POST /api/data/exports` (one at a time) queues `export.build`. The worker streams a ZIP to a
  temp file and uploads it to `org/<id>/exports/<exportId>.zip`. It contains:
  - `README.txt`, `manifest.json`
  - per sent, non-purged envelope (up to `EXPORT_MAX_ENVELOPES` = 2,000): `envelope.json`
    (details, recipients), `audit.json` (events + chain verification), `original.pdf`, and when
    completed `signed.pdf` and `certificate.pdf`
- Folders and labels (ADR 0022, 0025, 0038) are not exported; they only organise the lists. Purging
  an envelope keeps its folder and labels, and deleting a folder moves its documents, envelopes and
  templates up a level.
- `GET /api/data/exports` lists the last 10. `GET /api/data/exports/:id/download` returns a
  presigned `attachment` URL. Archives expire after **7 days** (`exports.cleanup`, daily), and
  the row is kept as history.

## Deleting a workspace

The owner uses **Settings → Data → Delete workspace** and types the name to confirm. That calls
better-auth's `organization.delete`:
- DB rows cascade: documents, envelopes, recipients, fields, audit trails, certificates,
  templates, webhooks, exports, settings, notifications.
- The `afterDeleteOrganization` hook queues `organization.purge-storage`, which deletes everything
  under `org/<id>/` in storage (`deletePrefix`, which refuses any prefix that isn't a workspace
  folder).
- Certificates stop verifying. The dialog says so and suggests exporting first.

## Deleting an account

A person can delete their own account (Settings → Security; docs/auth.md → Delete account, ADR
0040). Their personal data is erased and their files under `user/<id>/` are deleted
(`user.purge-storage`; `deletePrefix` accepts `org/<id>/` and `user/<id>/` only). Their work stays
with each workspace, credited to "Deleted user", and follows that workspace's retention.

## Tests

`apps/api/test/retention.itest.ts` covers what's deleted and what's kept (including a valid audit
chain), shared originals, API permissions, the sweep cutoff, the export's contents and expiry, and
the storage wipe after workspace deletion. The new routes are in `tenant-isolation.itest.ts`.

## Not in v1

Erasing one person across every envelope in a single action (purge their envelopes one by one),
exports larger than 2,000 envelopes, and emailing the owner when an export is ready (the Inbox
tells them, docs/notifications.md).
