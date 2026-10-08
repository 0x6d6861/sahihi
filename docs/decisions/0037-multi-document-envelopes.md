# 0037: Multi-document envelopes and supporting files

- **Status:** accepted
- **Date:** 2026-10-08

## Context
An envelope had exactly one PDF (`Envelope.documentId`). Finalize stamped that one file; the
certificate and `/verify` covered one hash; the signing page showed one viewer; templates carried
one document (ADR 0012). Senders want to send a contract and its annexes as **one** envelope, and
to share files that aren't signed (a price list, an ID copy, a spreadsheet) with the recipients.

## Decision
- **Data model.**
  - `EnvelopeDocument`: the documents to sign, in `order`. Each row carries its own
    `signedS3Key` / `signedSha256`, which used to live on `Envelope`.
  - `Field.envelopeDocumentId`: `page` is 1-based within that document.
  - `EnvelopeAttachment`: supporting files. Status `UPLOADING | READY | FAILED` (reuses
    `DocumentStatus`), a `sha256` once complete, stored under
    `org/{org}/envelopes/{env}/attachments/{id}`.
  - `TemplateDocument`, `TemplateField.templateDocumentId` and `TemplateAttachment` mirror them
    for templates.
  - `Envelope.bundleS3Key` holds the "Download all" zip.
  - The migration copies every existing envelope and template into one document row (order 0),
    keeps the signed hashes, points every field at its row, then drops the old columns.
- **Document links are `NO ACTION DEFERRABLE INITIALLY DEFERRED`.** A document that an envelope
  or template uses still can't be deleted, but the check runs at commit. Postgres runs the
  workspace-delete cascades (`Organization → Envelope → EnvelopeDocument` and
  `Organization → Document`) as separate internal statements, so an immediate check failed.
- **Limits** (`@sahihi/core`): 10 documents and 500 pages per envelope; 10 supporting files of at
  most 25 MB each.
- **Supporting file types:** PDF, PNG, JPEG, WebP, DOCX, XLSX, PPTX, CSV and TXT (the MIME type,
  or the extension when the browser sends none). No HTML, SVG or executables. Files are always
  served with `Content-Disposition: attachment`, never inline, so none can run in our origin.
- **One signed PDF per document.** Finalize goes through the documents in order. It skips any
  already signed, so a retry resumes where it stopped. For each document it checks the original's
  hash, stamps that document's fields, seals it and stores
  `signed/{envelopeDocumentId}.pdf`. One certificate covers the envelope: every document with its
  original and signed hash, and the supporting files with their hashes under "shared with
  signers, not signed".
- **Bundle.** After the certificate, finalize builds `bundle.zip` (numbered signed PDFs, the
  certificate, `supporting-files/`), streamed through a temp file with `fflate`. It's a
  convenience, not evidence, and a failure doesn't hold up the completion.
- **Verify.** A hash matches any document's `signedSha256` or the certificate. It never matches
  an original or a supporting file.
- **Drafts.**
  - `POST /envelopes/:id/documents` adds documents, `DELETE …/documents/:edId` removes one with
    its fields (never the last one), and `PUT …/documents/order` reorders them.
  - `PUT …/document` (Prepare pages) replaces one document and drops only that document's fields.
  - Supporting files use the upload pattern documents use: `attachments/uploads` → PUT →
    `complete`, then the sha256 is computed.
  - All of these are draft-only, for the creator, an admin or the owner, and audited: new event
    types `envelope.document_added` / `_removed`, `envelope.documents_reordered`,
    `envelope.attachment_added` / `_removed` and `recipient.attachment_viewed`.
  - Sending waits until no file is still uploading. `envelope.created` and `envelope.sent` record
    each document's and file's name and hash.
- **Templates** keep every document, the field layout per document, and their own copies of the
  supporting files (copied inside the bucket), so a template outlives the envelope's retention.
  Using a template copies the files again into the new envelope.
- **Compatibility.**
  - `CreateEnvelopeSchema` and v1 create-from-document take `documentIds` but still accept
    `documentId`. v1 fields take `document` (an index into `documentIds`, default 0).
  - `PUT /fields` defaults a missing `envelopeDocumentId` to the first document.
  - Webhook and v1 `data.envelope` gain `documents[]` and `attachments[]`. They keep `document`
    and `signedSha256`, which are the first document's.
  - Downloads keep `signed` (the first document's) next to `documents[]`, `attachments[]` and
    `bundle`. With a single document, the signed copy is still named after the envelope title.
- **Web.**
  - The editor's first step is "Documents": the ordered list with a ⋮ menu (Prepare pages, Open in
    library, Move up/down, Remove), "Add document" (search the library or upload), and the
    supporting files.
  - The field editor keeps one state for the whole envelope (the autosave replaces every field)
    and shows one document at a time behind an Arc `SegmentedControl` (`DocumentSwitcher`).
  - The signing page has the same switcher, with fields left per document. "Next field" walks
    every document and switches when it has to. A "Supporting files" list sits under the message.
  - The envelope page's Documents tab and the Preview step use the switcher too.
  - Downloads are an Arc `SplitButton`: "Download all" plus each file in its menu.

## Consequences
- Old `signed.pdf` keys (`keys.signed`) are kept for envelopes signed before this change. New
  ones go to `signed/{envelopeDocumentId}.pdf`.
- Purge deletes the whole envelope prefix (signed PDFs, supporting files, bundle). It renames
  supporting files to "Deleted file" and keeps their hashes. Each original is deleted only when
  no live envelope or template uses it.
- Exports put each envelope's originals and signed copies under `documents/` and the files under
  `supporting-files/`.
- Signers can't upload files. That would be a separate feature (a request field and an upload
  route on the public signing API, with its own security review).
