# 0015: Retention purges files and personal data, keeps the evidence

- **Status:** accepted
- **Date:** 2026-09-29

## Context
The Kenya DPA requires keeping personal data no longer than necessary and honouring erasure
requests. But a signed agreement's value is its evidence: if a signature is disputed years later,
the hashes, certificate and audit trail must still prove what happened. The audit trail is
append-only in the database (ADR 0010).

## Decision (agreed with the product owner)
- **Purge = delete files + personal data, keep evidence.** PDFs and signature images are deleted.
  Recipients, field values, titles and webhook payload snapshots are redacted. Status,
  timestamps, hashes, the certificate row and the audit trail stay. An `envelope.purged` audit
  event records it.
- **Retention is opt-in:** keep forever by default; owners can choose 1, 3, 7 or 10 years after
  closing. A daily job applies it. Owners and admins can also purge a closed envelope on request.
- **Exports** are built by the worker as a ZIP (fflate, streamed to disk then storage) and expire
  after 7 days.
- **Workspace deletion** also wipes the workspace's storage prefix, not only the database rows.

## Consequences
- `/verify/<code>` keeps working after a purge, with redacted names.
- Personal data that was written into audit payloads (void/decline reasons) remains, because audit
  rows are immutable. This is covered by the lawful-basis exception and documented.
- A document shared by several envelopes or a template is only deleted when the last user of it is
  purged.
- Deleting a workspace removes its audit trails too: evidence doesn't outlive the tenant. Owners
  are told, and pointed to the export first.
