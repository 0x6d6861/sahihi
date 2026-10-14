# Own storage (bring your own storage)

Workspaces can keep their files in storage they control (ADR 0051). Owners and admins manage it
under **Settings → Storage** (`data:manage`). Two tiers, set on the plan (`docs/billing.md`):

| Plan | `ownStorage` | What it does |
|---|---|---|
| Free, Starter | `none` | Nothing (they keep "Download all" and data exports) |
| Business | `sync` | 1 sync destination |
| Enterprise | `primary` | Primary storage in the workspace's bucket, plus 5 sync destinations |

**Sahihi never deletes anything in a customer's storage.** Not on a user action, a retention purge,
workspace deletion or disconnect. The setup guide asks for put, get and list permissions only, so
the bucket's own permissions enforce it. Where Sahihi would have deleted, it *releases* the file
(below).

## Providers

S3-compatible buckets through the existing `@aws-sdk/client-s3`: Amazon S3, Cloudflare R2, Backblaze
B2, Wasabi, DigitalOcean Spaces, Google Cloud Storage (HMAC keys, S3 interoperability) and any other
S3-compatible endpoint (MinIO, Ceph…). Presets (`STORAGE_PROVIDER_INFO` in
`packages/core/src/integrations/storage.ts`) fill in the endpoint, default region and path style.
Customer clients send checksums only when required (`requestChecksumCalculation: "WHEN_REQUIRED"`),
because several S3-compatible stores reject the SDK's default CRC32 headers.

Sync can also go to **Google Drive** (`drive.file` scope: Sahihi sees only files it created) and
**OneDrive** (`Files.ReadWrite.AppFolder`: Sahihi's app folder only), through plain `fetch` against
their REST APIs (`packages/infra/src/storage/drives.ts`). Each is offered only when its OAuth app is
configured (`GOOGLE_DRIVE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`; redirect URIs
`<WEB_URL>/api/storage/oauth/google/callback` and `…/microsoft/callback`). Cloud drives can't hold
primary storage.

## Credentials

- **Access keys**: the secret is encrypted with `encryptSecret` (AES-256-GCM, like webhook secrets)
  and never returned; the UI shows the access key id's last 4 characters.
- **IAM role (Amazon S3)**: Sahihi calls `sts:AssumeRole` with the role ARN and the workspace's
  ExternalId, `sahihi-` + an HMAC of the workspace id (`awsExternalId`), so it's stable, unguessable
  and no workspace can present another's. Offered only when `STORAGE_AWS_ACCOUNT_ID`,
  `STORAGE_AWS_ACCESS_KEY_ID` and `STORAGE_AWS_SECRET_ACCESS_KEY` are set. `GET /api/storage/aws-policies`
  returns the trust and permissions policies the form shows.
- **OAuth (Drive, OneDrive)**: the refresh token is encrypted the same way. Microsoft rotates refresh
  tokens; the new one is saved on use.
- **Endpoints** (custom or AWS) follow the webhook SSRF rules: HTTPS, a public host, no credentials,
  no path, and the host must not resolve to a private address (checked when the client is built,
  rebuilt every 5 minutes). `STORAGE_ALLOW_PRIVATE_ENDPOINTS=true` lifts this for development and
  tests only.

## Connections (`StorageConnection`)

`purpose` SYNC or PRIMARY (at most one PRIMARY per workspace; creation takes a per-workspace advisory
lock), `status` PENDING (never passed a test) → ACTIVE ↔ FAILING. "Test connection" writes and reads
`<prefix>.sahihi/connection-check` and lists the prefix; the probe is rewritten in place on every
test and never deleted. A connection is saved even when its first test fails, with the reason.

A health check (`storage.check`, every 6 hours) tests every ACTIVE or FAILING connection. A
connection that turns FAILING notifies the workspace's owners and admins (`storage.failing`), once.

## Sync

When an envelope completes, the finalize job's completion transaction (the one that issues the
certificate) creates a `StorageDelivery` per SYNC destination that has passed a test, while the plan
includes sync (`queueStorageDeliveries`, outbox). After commit they're enqueued on the `storage`
queue (`storage.deliver`, 8 attempts, exponential backoff); a sweep every 5 minutes re-enqueues any
that were committed but never enqueued.

Each delivery writes into one folder per envelope, from the connection's pattern (default
`{yyyy}/{mm}/{title} ({id})`; `{dd}` too; `{id}` is required: the envelope id's last 8 characters):

```
2026/10/Lease Unit 4 (k3j9x2ab)/
  Lease Unit 4 (signed).pdf          one per document (numbered when there are several)
  Lease Unit 4 (certificate).pdf
  audit-trail.json                   the hash-chained events and their verification
  supporting-files/01-prices.csv
```

Writes are **write-once**: a file already there with the same bytes is skipped (so a retry finishes
what a failed attempt started), different bytes fail the delivery without touching the file. On the
last attempt the delivery is FAILED, the destination FAILING, admins are notified and a
`storage.delivery_failed` webhook event is queued. Settings shows the latest deliveries with Retry,
"Retry failed copies", and "Copy earlier envelopes" (backfill: completed in the last 7–365 days, up
to 1,000, each once).

A plan without sync pauses it: no deliveries are created, and any that run fail as "Paused" (retry
them after upgrading). Disconnecting a destination deletes the row and its delivery log; the files
stay.

## Primary storage

Every `org/<id>/` object lives in the workspace's bucket, under the connection's prefix and with
Sahihi's usual keys (`<prefix>org/<id>/documents/<id>/original.pdf`). `user/<id>/` files (avatars,
saved signatures) aren't workspace data and stay in Sahihi's bucket.

`storageFor(orgId)` resolves the backend on every call (one indexed query) through the registry the
api, worker and test preload pass to `configureStorage`. States (`primaryState`):

| State | Writes go to | Reads try |
|---|---|---|
| (none) | Sahihi | Sahihi |
| `MIGRATING_IN` | customer | customer, then Sahihi |
| `ACTIVE` | customer | customer |
| `MIGRATING_OUT` | Sahihi | Sahihi, then customer |

- **Start using it** (`POST /storage/connections/:id/activate`, after a successful test):
  MIGRATING_IN, then `storage.migrate` copies every key the workspace's rows reference
  (`referencedKeys`: originals, thumbnails, signed PDFs, certificates, bundles, signature images,
  supporting files, template files, exports, the logo), skipping keys already there, in two passes
  so files written meanwhile aren't missed. Then ACTIVE, and Sahihi's copies under `org/<id>/` are
  deleted (they're ours).
- **Disconnect**: MIGRATING_OUT, the same copy back to Sahihi, then the connection row is deleted.
  Nothing in the customer's bucket is deleted. Settings shows progress; "Restart if it's stuck"
  re-enqueues the job (copied files are skipped), and the 5-minute sweep restarts lost jobs.
- **Downgrades**: `bun run billing:set-plan` refuses to move a workspace below Enterprise while
  primary storage is connected.

### Uploads

Browser uploads never go straight to the customer: `presignUpload` points at
`staging/<key>` in Sahihi's bucket. `complete` reads the upload from there (`uploaded`,
`readUpload`), validates it, then `commitUpload` writes it to the customer's bucket and deletes the
staged copy. A rejected upload is `discardUpload`ed and the abandoned-upload sweep does the same, so
neither ever reaches the customer. A Word upload (ADR 0052) never reaches the customer either: it
waits staged (the public API stages it with `stageUpload`) until the worker has converted it, then
the PDF is `put` to the workspace's storage and the Word file is discarded.

### File access

The browser never talks to a customer's bucket. Instead of presigned URLs, the API hands out
**tickets**: `<WEB_URL>/api/storage/objects/<ticket>`, an HMAC-signed, expiring reference to one
object of one workspace (`signStorageTicket`; the key must be under `org/<orgId>/`). The public,
rate-limited route (600/min per IP) streams the file, with the ticket's file name and disposition;
anything but PDFs and PNG/JPEG images, and every "attachment" ticket, is served as a download.
Thumbnails get windowed tickets that repeat for 15 minutes and are cacheable, like
`presignCacheable`. So the CSP keeps one storage origin, customers configure no CORS, and signers
never learn the bucket's address. The cost is API bandwidth for these workspaces.

### Write-once and versioned keys

Every key a job or request can write twice carries a version (`objectVersion()`), new on each
attempt: thumbnails, signature images, signed PDFs, certificates, bundles and exports. A retry
writes a new key instead of replacing the old one (finalize's PDFs differ on every attempt: the
modification date and certificate code change). An unused earlier attempt is an orphan under the
envelope's folder, removed with it on purge in Sahihi's bucket.

### Released files

`releaseObject(orgId, key, reason)` / `releasePrefix(…)` replace every delete of a workspace file.
In Sahihi's bucket they delete. With primary storage they log a `StorageRelease` (full key with
prefix; a key ending in `/` means everything under it), tag the object `sahihi=released` where the
provider supports tags (Amazon S3), emit `storage.objects_released`, and delete any copy
still in Sahihi's bucket. Reasons: `DELETED`, `REPLACED`, `UPLOAD_REJECTED`, `RETENTION`, `EXPIRED`
(exports), `WORKSPACE_DELETED`. Settings lists them; `GET /api/storage/releases.csv` exports the
whole log for a cleanup script or a lifecycle rule.

Deleting a workspace deletes its connection (and log) with it; its bucket is untouched.

## API (`/api/storage`, owner/admin: `data:manage`)

| Route | |
|---|---|
| `GET /` | Plan tier, connections with their latest 10 deliveries, released count, IAM role setup, OAuth providers on offer |
| `GET /aws-policies?bucket&prefix` | Trust and permissions policy JSON for the form |
| `POST /connections` | Connect an S3-compatible bucket (`CreateS3ConnectionSchema`); 402 over the plan; tested at once |
| `PATCH /connections/:id` | Name, folder pattern, new keys (re-tested) |
| `POST /connections/:id/test` | Test now |
| `POST /connections/:id/activate` | Primary: start using it (202) |
| `POST /connections/:id/migration/retry` | Restart a migration |
| `DELETE /connections/:id` | Sync: 204. Primary in use: 202, moves files back first |
| `GET /connections/:id/deliveries?cursor` | Delivery log, 50 a page |
| `POST /connections/:id/deliveries/:deliveryId/retry` | Retry a FAILED delivery |
| `POST /connections/:id/retry-failed` | Retry every FAILED delivery |
| `POST /connections/:id/backfill` `{ days }` | Copy earlier completed envelopes |
| `GET /releases?cursor`, `GET /releases.csv` | Released files |
| `POST /oauth/start` | Google Drive / OneDrive consent URL (signed `state`, 15 minutes) |
| `GET /oauth/:google\|microsoft/callback` | Exchanges the code, creates the destination, redirects to Settings → Storage |

`GET /api/storage/objects/:ticket` is public (above).

## Local development

`bun run infra:up` creates a second MinIO bucket, `sahihi-customer`, to try this with: provider
"Other S3-compatible", endpoint `http://localhost:9000`, keys `sahihi` / `sahihi-secret`, and
`STORAGE_ALLOW_PRIVATE_ENDPOINTS=true` in `.env`.

## Tests

`apps/api/test/storage.itest.ts` (plans, permissions, tests, sync, write-once conflicts, pause,
backfill, migration in and out, staged uploads, tickets, releases, the downgrade guard) runs against
`sahihi-customer`; `storage-drives.itest.ts` mocks Google's and Microsoft's APIs at `fetch`;
`packages/core/src/integrations/storage.test.ts` covers schemas, folder names, tickets, ExternalIds
and policies.

## Not in v1

- Azure Blob Storage (an `@azure/storage-blob` driver behind the same interface when asked for).
- SharePoint document libraries (needs `Sites.ReadWrite.All`; OneDrive's app folder for now).
- Sahihi-managed regional buckets (data residency) and customer-managed KMS keys (BYOK).
- A public API for the released-files log (the CSV and the webhook cover automation today).
