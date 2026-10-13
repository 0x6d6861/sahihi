# 0051: Bring your own storage: sync on Business, primary storage on Enterprise, never delete

- **Status:** accepted
- **Date:** 2026-10-13

## Context
Workspaces want their files in storage they control. In practice that means one of three things:
"keep a copy of the signed paperwork in our system of record", "our files must not sit in someone
else's bucket", or "data must stay in a region". Today every file lives in one private bucket
reached through `packages/infra/src/storage.ts`. The browser reads and writes it with presigned URLs
whose single origin is allowed by the CSP (`STORAGE_ORIGIN`). Files are deleted in about 20 places:
user actions, upload sweeps, retention purges and workspace deletion.

A customer's storage is outside our control. It can disappear, lose permissions or be edited. The
evidence (`sha256`, `signedSha256`, audit chain, certificate code) stays in our database, so
tampering is detectable, but signing must not quietly depend on storage we can't vouch for unless
the customer explicitly chose that.

## Decision
- **Two tiers, set on the plan** (`docs/billing.md`):
  - **Business: sync.** When an envelope completes, its signed PDFs, certificate, audit trail and
    supporting files are copied to the customer's storage. Sahihi's bucket stays primary, so a
    broken destination delays a copy but never blocks signing.
  - **Enterprise: primary storage.** Every `org/<id>/` object lives in the customer's bucket, with
    sync to other destinations included. Free and Starter: neither.
- **S3-compatible first**, with the existing `@aws-sdk/client-s3`: AWS S3, Cloudflare R2, Backblaze
  B2, Wasabi, DigitalOcean Spaces, MinIO, and GCS through its S3 interoperability. On AWS, an IAM
  role (STS AssumeRole with an ExternalId we generate) is preferred to access keys. Google Drive and
  OneDrive/SharePoint come later as sync destinations, Azure Blob on request. No storage abstraction
  library: flydrive doesn't cover Azure or presigned uploads, and OpenDAL is a native addon with
  unproven Bun support.
- **Sahihi never deletes anything in a customer's bucket.** Not on a user action, retention purge,
  workspace deletion or disconnect.
  - Our setup guides ask for `PutObject`, `GetObject` and `ListBucket` only, so the customer's own
    permissions enforce the promise. "Test connection" writes and reads a fixed probe key
    (`{prefix}/.sahihi/connection-check`) and never deletes it.
  - Customer storage is **write-once**: an existing key is skipped when its bytes match and refused
    when they don't.
  - Where we used to delete, we **release**: the object leaves our records and is listed in a
    released-files log (settings, CSV, public API, a `storage.objects_released` webhook event).
    Where the provider supports tags (AWS S3), released objects are tagged `sahihi=released` so a
    lifecycle rule can expire them.
  - Uploads for a primary-storage workspace land in a staging area in our bucket and reach the
    customer's bucket only after validation, so abandoned or invalid uploads never get there.
- **The seam is a per-workspace driver.** `storageFor(orgId)` returns the workspace's storage,
  `userStorage()` returns ours (avatars and saved signatures are not workspace data and never leave
  our bucket), and every delete of a workspace object goes through `releaseObject` /
  `releasePrefix`. Only Sahihi's own driver implements `DeletableStorage`, so deleting from a
  customer's bucket can't even be written.
- **Customer buckets are reached through the API**, not with presigned URLs to their host: the CSP
  keeps one storage origin, customers don't configure CORS, signers never see the bucket's host,
  and hashes can be checked on the way through. The cost is API bandwidth for those workspaces.

## Consequences
- The customer is responsible for erasing files in their own bucket, including signers' personal
  data inside signed PDFs. Retention settings and workspace deletion only affect Sahihi's copy for
  these workspaces; the settings, the deletion dialog, `docs/data-retention.md` and the privacy and
  security pages must say so (new legal wording, needs review).
- Released files build up in customer buckets (deleted drafts, purged envelopes) until the customer
  cleans them up.
- **Write-once breaks retries that rewrite a key with different bytes.** `stampFields` sets the
  PDF modification date to "now", so a finalize retry after the upload but before the database
  update writes a different signed PDF to the same key; `bundle.zip` is rebuilt the same way.
  Before primary storage ships, worker outputs for customer storage need keys unique per attempt
  (or deterministic bytes).
- A workspace using primary storage can't be moved below Enterprise until its files are migrated
  back (`billing:set-plan` refuses). Below Business, sync destinations are paused, not removed.
- Storage failures become a customer-visible state (health check, notifications, a delivery log),
  not just an alert for us.
