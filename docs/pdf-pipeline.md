# PDF pipeline

## 1. Upload (`apps/api/src/routes/documents.ts`)

```
browser                         api                                  S3
  │ POST /documents/uploads ───▶ validate CreateUploadSchema
  │                              (PDF or .docx, ≤ 25 MB)
  │                              Document(UPLOADING, s3Key)
  │ ◀──────── { document, uploadUrl } (presigned PUT, 5 min)
  │ PUT bytes ───────────────────────────────────────────────────▶ original.pdf
  │ POST /documents/:id/complete ▶ storage.head (exists, size)
  │                              storage.get → inspectPdf
  │                              sha256 → READY {sha256, pageCount, pages}
  │                              or FAILED {failureReason} + release object (422)
```

A Word file takes a detour through the worker; see **Word uploads** below.

Web side (`app/(app)/documents/`): Extend `FileUpload` (a PDF or a Word file, single file) in the
empty state and in the "Upload document" dialog. `lib/upload.ts#prepareUpload` pre-checks the file
against `CreateUploadSchema`: a PDF or .docx by MIME type, or by extension when the MIME type is
empty (`documentUploadType`), 1 byte to 25 MB, and the name trimmed to 200 characters ("Prepare
document" passes `pdfOnly`). `useDocumentUpload` then runs the three calls (`uploadDocument`). The
S3 PUT uses XHR, because fetch has no upload progress, and progress shows in Arc `Progress`
(`uploadPercent`). The bucket's CORS must allow `PUT` with `Content-Type` from `WEB_URL`. Results
and errors show as toasts.

### Word uploads (ADR 0052)

```
browser                         api                          worker (LibreOffice)
  │ POST /documents/uploads ───▶ contentType = .docx MIME
  │                              Document(UPLOADING, convertedFrom DOCX, name "Lease.pdf")
  │ ◀──── presigned PUT for documents/<id>/source.docx (staged for own storage)
  │ POST /documents/:id/complete ▶ sniff: a Word body? else FAILED (422)
  │                              CONVERTING (202) ──── document.convert ───▶ sanitizeDocx
  │ GET /documents/:id (polls)                                   soffice --convert-to pdf
  │                                                              inspectPdf, sha256
  │                                                              put original.pdf → READY
  │                                                              discard source.docx, thumbnail
```

- **What's refused** (FAILED, with the reason shown to the sender): bytes that aren't a Word body
  (on `complete`); macro-enabled, password-protected and old .doc files, zip bombs (over 200 MB or
  5,000 parts unzipped); files with **tracked changes** (LibreOffice prints them with their markup,
  so the sender accepts or rejects them in Word first); anything LibreOffice can't open or takes
  over 90 seconds on; a PDF result over 25 MB or that fails `inspectPdf`.
- **Safety** (`packages/pdf/src/convert/docx-to-pdf.ts`): `sanitizeDocx` drops external
  relationships other than hyperlinks (linked images, templates, OLE links) and blanks fields that
  pull content in (INCLUDEPICTURE, INCLUDETEXT, DDE, LINK…). LibreOffice runs headless with a
  fresh profile per conversion (macros off, links from documents blocked), `HOME`/`TMPDIR` in a
  temporary folder, an environment without the worker's (no database URL, no keys), in its own
  process group, killed after 90 seconds. Comments aren't printed.
- **Queue:** `document-conversions`, `jobId: convert-<documentId>`, 2 attempts, one conversion at
  a time per worker. A refused file fails at once; other errors retry once, then fail. The uploads
  sweep (every 15 minutes) re-queues conversions waiting over 5 minutes and fails those waiting
  over an hour, removing their Word file. Idempotent: a PDF a crashed attempt already stored is
  used as it is.
- **What's kept:** the PDF only, as `original.pdf`, exactly like an uploaded PDF (hashed, immutable
  once READY). The Word file is discarded. `Document.convertedFrom = DOCX` says where it came
  from; the document page shows "Converted from Word".
- **Web:** a single upload waits for the conversion (stage "Converting to PDF…", up to 3 minutes,
  then "Still converting"); a dropped batch doesn't wait. Files and the document page refresh
  every few seconds while a document is CONVERTING (`RefreshWhileConverting`). The public API
  returns 202 with `status: "CONVERTING"`; poll `GET /api/v1/documents/:id`.
- **Installing LibreOffice on the worker:** headless Writer and fonts metric-compatible with
  Word's (Carlito for Calibri, Caladea for Cambria, Liberation for Arial / Times New Roman /
  Courier New), e.g. on Debian/Ubuntu `libreoffice-writer-nogui fonts-crosextra-carlito
  fonts-crosextra-caladea fonts-liberation2 fonts-noto-core`. On Railway, add them to the worker
  service's build (`RAILPACK_DEPLOY_APT_PACKAGES`). `LIBREOFFICE_PATH` (default `soffice`) is
  looked up on a fixed `PATH` (`/usr/local/bin:/usr/bin:/bin`); set an absolute path otherwise.
  Without it, Word uploads fail with "Word documents can't be converted right now".

List (`GET /documents?page=N&folderId=&q=&tag=&color=&status=&senderId=&period=`): validated with
`ListDocumentsQuerySchema` (`parseQuery`, 400 on bad input). It returns
`{ items, page, pageSize: 25, total, senders, tags, colors }`, excludes `UPLOADING` rows, and sorts newest
first. Without `folderId` it lists the top level; an unknown folder is a 404. `q` (case-insensitive
match on the name **or** a tag), `tag` (a tag name, case-insensitive) and `color` (hex, with or without `#`)
search **every** folder (ADR 0025). `status` (`READY`/`FAILED`), `senderId` (uploader) and `period`
(`7d`, `30d`, `90d`, `year` = since 1 January UTC, `periodStart`) narrow either view. `senders` are
the workspace's uploaders, for the Sender filter; `colors` the label colours in use (presets first);
`tags` are the tags in use on a listed document or
any folder, for the Tag filter and the tag picker. Each row has `uploadedBy`, `folder`, `color`,
`tags` and `permissions: { move, label, rename }`.

Folders (ADR 0022, `routes/folders.ts`): nested, org-scoped, at most `MAX_FOLDER_DEPTH` (8) levels,
sibling names unique (case-insensitive, 409). `GET /folders?parentId=` → `{ folder, path, items }`
(subfolders with `documentCount`/`folderCount`); `GET /folders?all=1` → every folder with its
`path` (for "Move to…"); `GET /folders?q=&tag=&color=` → matching folders from anywhere, each with
its parent's `path`; `POST /folders`, `PATCH /folders/:id` (rename / move / label; a move into its
own subtree is a 400, `checkFolderMove`), `DELETE /folders/:id` (its documents and subfolders move up to
its parent in one transaction; nothing else is deleted). `PATCH /documents/:id { name?, folderId?, color?,
tags? }` renames, moves (`null` = top level) and/or labels a document (a rename is a 409 once a
non-draft envelope uses it: signers and the certificate show the name), and `POST /documents/uploads` takes
an optional `folderId`. Folders are organisation only: envelopes, templates and certificates never
read them.

Labels (ADR 0025): folders and documents take an optional `color` (hex, stored as uppercase `#RRGGBB` or
`#RRGGBBAA` by `LabelColorSchema`; `null` clears it) and up to `MAX_TAGS_PER_ITEM` (10) tags of at most 40 characters. `tags` is always
the full list; names are trimmed, inner spaces collapsed and case-insensitive repeats dropped
(`TagListSchema`). Tags are workspace rows (`Tag`, unique on the lowercased `key`), created on first
use and shared: "NDA" and "nda" are one tag and the first spelling stays. Labelling follows the move
rule for documents and the manage rule for folders.

Documents are listed in All files (`/files`, the app's home; ADR 0038, ADR 0041), with folders,
"Upload document" into the open folder, search and Type / Status / People / Added / Tags / Color
filters, a list or a grid, and a row menu (Open, Create envelope, Move to…). `/documents` redirects
there filtered to documents; `/documents/:id` and its Prepare page stay.
The list returns `thumbnailUrl` per item: `presignCacheable` (signed at the start of a 15-minute
window, valid 30 minutes, `Cache-Control: private, max-age=900`), so repeat visits hit the browser
cache. The web grid (List / Grid saved in the `sahihi-files-layout` cookie, `DocumentCard`) shows it in Extend `FileThumbnail`.


### Field detection (ADR 0020)

`GET /documents/:id/field-suggestions` (READY documents, org-scoped) downloads the original and
returns `{ suggestions, skipped }`: `FieldSuggestion`s (normalized rect, `type`, `page`,
`required`, `roleHint`, `source: "anchor" | "form" | "text"`, `sourceName`) in reading order.
Anchor tags win over form fields where the two overlap. Text rules run only when neither finds
anything. One PDFium pass (`readPageText(bytes, { measure, lines: true })`) serves anchors and
rules. Nothing is stored.

**Anchor tags.** `readPageText(bytes, anchorRanges)` (`@sahihi/pdf`, PDFium WASM via
`@embedpdf/pdfium`) returns each page's text, one code unit per PDF character (non-BMP characters
become U+FFFD so indexes line up). Its glyph boxes are sparse: only the ranges `anchorRanges` asks
for are measured. Measuring every glyph took 2.7 s and ~750 MB on 300 dense pages; measuring only
the tags takes ~0.4 s. `suggestFieldsFromAnchors` (`@sahihi/core`) finds the tags:

| Tag | Field |
|---|---|
| `{{s1:signature}}` (`sig`, `sign`) | `SIGNATURE` |
| `{{s1:initials}}` (`initial`, `init`) | `INITIALS` |
| `{{s1:date}}` | `DATE_SIGNED` |
| `{{s1:name}}`, `{{s1:email}}`, `{{s1:text}}` | `NAME`, `EMAIL`, `TEXT` |
| `{{s1:checkbox}}` (`check`) | `CHECKBOX` (optional by default) |
| `…:optional` / `…:required` | overrides `required` |

The role is 1–32 of `A-Z a-z 0-9 _ -`. It's case-insensitive, and spaces inside the braces are
ignored. `s1`/`signer1`/`party 1`/`1` mean the first recipient in the list. The field starts at the
tag's bottom-left corner and grows up and right to at least `ANCHOR_MIN_SIZE` (signature 160×40 pt,
date 100×20 pt, …). Tags with an unknown type or option, or with no glyph boxes, count as `skipped`.
Tag text stays in the PDF, so senders should make it white or tiny.

The PDFium module is created once per process, from the `.wasm` bundled next to the build output
(like the fonts). Each call is synchronous after that first load, so concurrent requests can't
interleave on it.

**Form fields.** `readFormWidgets` (`@sahihi/pdf`) lists the AcroForm widgets: kind, fully
qualified name, page (found through each page's `/Annots`, because `/P` is often missing) and
`/Rect`. Hidden widgets are left out, and a form pdf-lib can't read gives `[]`.
`suggestFieldsFromForm` (`@sahihi/core`) then:

- normalizes the rect (`fromPdfRect`, so rotation and crop offsets are handled) and crops it to
  the page. Widgets that are off-page, smaller than 0.5% of the page, or on an unknown page are
  `skipped`;
- types it: signature → `SIGNATURE`, checkbox → `CHECKBOX` (optional), text by name (`date` →
  `DATE_SIGNED`, `email`, `initials`, `printed name` → `NAME`, `sign` → `SIGNATURE`, else `TEXT`).
  Radios, lists and buttons are skipped;
- reads a `roleHint` from the name minus type words (`Buyer_SignDate[0]` → `buyer`).

**Text rules (fallback).** `suggestFieldsFromText` (`packages/core/src/field-detection/text-rules.ts`) pairs labels
with signature lines:

| Label (any case) | Field |
|---|---|
| `Signature`, `Authorised signature`, `Signed`, `Sign here`, `By:` | `SIGNATURE` (36 pt tall) |
| `Initials` | `INITIALS` (28 pt) |
| `Date`, `Dated` | `DATE_SIGNED` (18 pt) |
| `Name`, `Printed name`, `Full name` | `NAME` (18 pt) |
| `Email`, `E-mail address` | `EMAIL` (18 pt) |

- **Lines** are typed blanks (`_{4,}`, dot leaders, `…`) and drawn paths at most 3 pt thick and at
  least 36 pt long. The reader keeps paths ≤ 3 pt thick in either direction, so rotated pages work.
- **Pairing:** a line to the right on the same row (the nearest label wins), else a line just above
  the label. A `Label:` that ends its row and has no line gets a field right after it.
- **Owner (`roleHint`):** the capitalized party word to the left on the row, else the nearest one
  above in the same column (≤ 20% of the page height). Party words are `ROLE_WORDS` plus terms
  defined in the text (`(the "Supplier")`, `(hereinafter referred to as the "Tenant")`).
- **Precision guards:** a label word counts only when it's followed by a colon, sits on a short
  row (≤ 60 characters) or shares a row with a blank. `createTextRuleScanner()` measures nothing on
  pages that can't hold a field.

The editor turns the suggestions into fields (see `docs/ui.md` → Field editor).

## 2. Signing (values only)

The signer submits `SubmitSigningSchema`: `consent: true` plus field values. Signature and initials
arrive as PNG data URLs (≤ ~500 KB), are decoded by `pngFromDataUrl` (which rejects non-PNGs) and
stored at `fields/{fieldId}.png`. Text and checkbox values go in `Field.value`. `DATE_SIGNED`, `NAME`
and `EMAIL` are **filled by the server** from recipient data, and client values for them are ignored.

**The browser never produces the final PDF bytes.**

## 3. Finalize (`apps/worker/src/jobs/finalize.ts`)

**Several documents (ADR 0037).** An envelope's documents (`EnvelopeDocument`, in `order`) are
finalized one by one. Each gets its own hash check, its own fields stamped, its own seal and its own
`signed/{envelopeDocumentId}.pdf`. A document that already has `signedS3Key` is skipped, so a retry
resumes where it stopped. The certificate lists every document (original and signed SHA-256) and the
supporting files (SHA-256, "shared with signers, not signed"). Last, `bundle.zip` ("Download all":
numbered signed PDFs, the certificate, `supporting-files/`) is streamed to a temp file and stored as
`Envelope.bundleS3Key`. It's a convenience: if it fails, the envelope still completes, and the next
finalize run retries it.


Triggered when the last actionable recipient signs (`jobId: finalize:<envelopeId>`).

1. Load the envelope. It must be `COMPLETED`. If a certificate already exists, **skip** (idempotent).
2. If `signedS3Key` isn't set yet:
   1. download `original.pdf` and **verify its SHA-256 equals `Document.sha256`**, failing loudly
      otherwise
   2. `stampFields(original, fields)`: draws PNGs (contain-fit), text (auto-sized with
      `fitFontSize`/`wrapText`, Noto Sans, see **Fonts**) and checkmarks using
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

Stamped text and certificates use **Noto Sans** (SIL OFL 1.1, `packages/pdf/fonts/` with
`OFL.txt`), embedded with `@pdf-lib/fontkit` (`src/fonts.ts`). Stamping embeds only Regular; the
certificate embeds Regular and Bold; AI-generated documents (docs/ai-documents.md) embed all four,
Italic and Bold Italic being the hinted build of the same 2.015 release. Fonts are **subset**, so a stamped PDF grows by a few KB, not
600 KB, and each subset has a ToUnicode map, so the text stays searchable and copyable.

- **Coverage:** Latin with all extensions (Swahili, Kikuyu ũ/ĩ, Polish, Turkish, Vietnamese…), Greek
  and Cyrillic.
- **Replaced with "?"** by `sanitizeForFont`, one per character:
  - characters Noto Sans has no glyph for (CJK, Ethiopic, Arabic, symbols such as ✓);
  - scripts that need shaping or RTL layout even when the glyphs exist (Hebrew, Arabic, Indic,
    Thai, Lao, Tibetan, Myanmar, Khmer; `needsShaping`). pdf-lib places glyphs one by one, so
    these would render wrongly.

  The exact text is always kept in `Field.value` and the audit trail. Adding a script means
  bundling its Noto font and a shaping engine (e.g. harfbuzz), so it's a new roadmap item.
- **Glyph padding:** fontkit's subsetter writes a short-format `loca`, which assumes even glyph
  offsets. Noto's static TTFs have odd-length glyphs, and unpadded subsets render most glyphs
  blank. `padGlyphs` (`src/ttf.ts`) rewrites `glyf`/`loca` with 4-byte-padded glyphs when the font
  loads (once per process). `ttf.test.ts` checks the embedded subset's outlines, so a font swap
  can't regress silently.
- **Bundling:** the TTFs are imported `with { type: "file" }`. In source mode that gives an absolute
  path. After `bun build`, the TTFs are copied next to the bundle and resolved against
  `import.meta.dir`, so `dist/` works from any cwd.
- Forms are only flattened when the PDF has an AcroForm. `getForm()` would otherwise create one and
  embed Helvetica.

## 4. Downloads

`GET /envelopes/:id/downloads`, `GET /sign/:token/downloads` and `GET /v1/envelopes/:id/downloads`
return `{ documents: [{ id, name, url }], certificate, attachments: [{ id, name, url }], bundle,
signed }` (ADR 0037). `signed` is the first document's, for older callers. Everything is a
presigned, attachment-disposition URL. With one document, its signed copy is still named after the
envelope title ("Lease (signed).pdf"); with several, each keeps its own name. The web shows an Arc
`SplitButton`: "Download all" plus each file in its menu.


- Sender: `GET /api/envelopes/:id/downloads` (org-scoped). Recipient: `GET /api/sign/:token/downloads`,
  with the fresh link from the completion email. Both return `{ signed, certificate }` presigned
  URLs, and a 409 until finalize has stored both files.
- The links are served as `attachment`, with RFC 6266 file names from `downloadFileName()` /
  `contentDisposition()` (`@sahihi/core`): `<title> (signed).pdf`, in any script, with an ASCII
  fallback and an exact UTF-8 `filename*`. The PDF viewers keep `inline`.
- The URLs live for 5 minutes, so the web fetches them **when a download button is clicked**, never
  at page load (`components/app/downloads/download-buttons.tsx`, shared by the envelope page and
  the signer's completed state).
- The envelope page shows a "Signed and certified" card for `COMPLETED` envelopes: both downloads,
  the certificate code and a link to its public `/verify/<code>` page. While finalize is still
  running, it shows a "being produced" notice instead.

## Invariants

- `original.pdf` is never modified. Its hash is on the certificate.
- `signed.pdf` = original + stamped values (+ provider seal). The certificate is a **separate** file
  so it can quote `signedSha256`.
- Anything that changes stamping output needs a golden test in `packages/pdf/src/render/pdf.test.ts`.
