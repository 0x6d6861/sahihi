# PDF pipeline

## 1. Upload (`apps/api/src/routes/documents.ts`)

```
browser                         api                                  S3
  │ POST /documents/uploads ───▶ validate CreateUploadSchema
  │                              (pdf only, ≤ 25 MB)
  │                              Document(UPLOADING, s3Key)
  │ ◀──────── { document, uploadUrl } (presigned PUT, 5 min)
  │ PUT bytes ───────────────────────────────────────────────────▶ original.pdf
  │ POST /documents/:id/complete ▶ headObject (exists, size)
  │                              getObjectBytes → inspectPdf
  │                              sha256 → READY {sha256, pageCount, pages}
  │                              or FAILED {failureReason} + delete object (422)
```

Web side (`app/(app)/documents/`): Extend `FileUpload` (PDF only, single file) in the empty state
and in the "Upload PDF" dialog. `lib/upload.ts#prepareUpload` pre-checks the file against
`CreateUploadSchema`: PDF MIME type or a `.pdf` name with an empty MIME, 1 byte to 25 MB, and the
name trimmed to 200 characters. `useDocumentUpload` then runs the three calls. The S3 PUT uses XHR,
because fetch has no upload progress, and progress shows in coss `Progress` (`uploadPercent`). The
bucket's CORS must allow `PUT` with `Content-Type` from `WEB_URL`. Results and errors show as toasts.

List (`GET /documents?page=N`): 1-based `page` validated with `ListDocumentsQuerySchema`
(`parseQuery`, 400 on bad input). It returns `{ items, page, pageSize: 25, total }`, excludes
`UPLOADING` rows, and sorts newest first. The web list shows an Extend `FileThumbnail` (PDF glyph,
no rendered preview yet) and coss `Pagination` (`lib/pagination.ts#pageWindow`). A page past the end
redirects to the last page, and an invalid page redirects to `/documents`.

Detail page (`app/(app)/documents/[id]/`): for a `READY` document it fetches the presigned GET from
`/documents/:id/file` on the server and renders `components/app/document-viewer.tsx`, which is Extend
`PDFViewer` loaded with `next/dynamic` (`ssr: false`), `showUpload={false}` and read-only. "Create
envelope" posts a DRAFT envelope titled after the file (`envelopeTitleFromFileName`) and opens it.
`UPLOADING` and `FAILED` documents show an `Alert` instead of the viewer.

`inspectPdf` rejects encrypted, invalid, empty and >500-page files. Password-protected PDFs aren't
supported; the user must remove the protection first.

Abandoned uploads: the `documents.sweep-uploads` maintenance job runs every 15 minutes. It finds
`UPLOADING` documents older than `UPLOAD_ABANDON_AFTER_MS` (1 hour, `@sahihi/core`), marks them
`FAILED` ("Upload was not completed") and soft-deletes them (`deletedAt`), then deletes the storage
object in case the PUT landed but `complete` never ran. The update only matches rows that are still
`UPLOADING`, so a late `complete` wins and reruns are no-ops.

Planned: optional DOCX→PDF conversion (LibreOffice in the worker).

## 2. Signing (values only)

The signer submits `SubmitSigningSchema`: `consent: true` plus field values. Signature and initials
arrive as PNG data URLs (≤ ~500 KB), are decoded by `pngFromDataUrl` (which rejects non-PNGs) and
stored at `fields/{fieldId}.png`. Text and checkbox values go in `Field.value`. `DATE_SIGNED`, `NAME`
and `EMAIL` are **filled by the server** from recipient data, and client values for them are ignored.

**The browser never produces the final PDF bytes.**

## 3. Finalize (`apps/worker/src/jobs/finalize.ts`)

Triggered when the last actionable recipient signs (`jobId: finalize:<envelopeId>`).

1. Load the envelope. It must be `COMPLETED`. If a certificate already exists, **skip** (idempotent).
2. If `signedS3Key` isn't set yet:
   1. download `original.pdf` and **verify its SHA-256 equals `Document.sha256`**, failing loudly
      otherwise
   2. `stampFields(original, fields)`: draws PNGs (contain-fit), text (auto-sized with
      `fitFontSize`/`wrapText`, Helvetica, WinAnsi-sanitized) and checkmarks using
      `toPdfPlacement`; flattens any AcroForm; sets title and metadata
   3. `getSigningProvider().seal(stamped, evidence)`. INTERNAL returns the bytes unchanged; a CA
      provider will embed a PAdES signature
   4. hash, then store `signed.pdf`, set `signedS3Key`/`signedSha256`, audit `document.finalized`
3. Render the certificate (`renderCertificate`) from the envelope, signers and the **full audit log**
   (including the chain head hash), store `certificate.pdf`, create `Certificate` and audit
   `certificate.issued`.
4. Enqueue `envelope.completed`. Every recipient and the sender get fresh download links.

Each step checks what already exists, so BullMQ retries are safe.

### Fonts

pdf-lib's standard fonts are WinAnsi only. `sanitizeForFont` replaces characters that can't be
encoded, so text fields with non-Latin scripts currently degrade. To support them, embed a Unicode TTF
(Noto Sans) with `@pdf-lib/fontkit`, recorded as a roadmap item.

## Invariants

- `original.pdf` is never modified. Its hash is on the certificate.
- `signed.pdf` = original + stamped values (+ provider seal). The certificate is a **separate** file
  so it can quote `signedSha256`.
- Anything that changes stamping output needs a golden test in `packages/pdf/src/pdf.test.ts`.
