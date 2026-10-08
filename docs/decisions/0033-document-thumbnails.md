# 0033: Document thumbnails rendered by the worker

- **Status:** accepted
- **Date:** 2026-10-08

## Context
The Documents page needed a grid view that shows each document's first page. Two ways to
produce the image:

1. **In the browser**, with the PDFium WASM engine the viewer already loads
   (`lib/pdf-thumbnail-utils.ts`). There is no backend work, but every card needs its own presigned
   URL and fetches PDF bytes. That is slow for large or scanned files and on weak phones, and the
   work is repeated on every visit.
2. **In the worker, once**, when the document becomes READY. The grid then only loads small images.

The worker already runs PDFium (`@sahihi/pdf`, field detection) but had no image encoder, and the
repo pins few dependencies (AGENTS.md rule 18).

## Decision
- **Render on the server, once.** When a document becomes READY (`POST /documents/:id/complete`,
  `POST /api/v1/documents`), the API queues `document.thumbnail` on a new `documents` queue after
  the write, and does nothing more if Redis is down (`lib/thumbnails.ts`). The worker
  (`jobs/thumbnails.ts`) renders page 1 with PDFium (`renderThumbnail`: 480px wide, as displayed
  with /Rotate applied, white background, annotations included) and stores
  `org/{orgId}/documents/{documentId}/thumbnail.png`. It then sets `Document.thumbnailKey`. If
  PDFium can't render the file, the worker records `thumbnailError` and the grid shows a file icon.
  The job is idempotent: the job id is the document id, and the worker skips a document that is
  gone, not READY, or already has a thumbnail.
- **Separate queue.** The `maintenance` worker runs one job at a time, and exports and bulk sends
  can take minutes. Thumbnails get their own `documents` queue (2 at a time) so a new upload's
  preview appears within seconds.
- **Backfill.** Every hour, `documents.sweep-thumbnails` queues up to 200 READY documents that have
  neither a thumbnail nor a recorded failure. It covers documents uploaded before this change and
  jobs lost to a Redis restart.
- **PNG with a small encoder of our own** (`encodePng`: RGB, Sub filter, `node:zlib` deflate and
  crc32). There is no `sharp` (a native binary) and no new package. Rendered text pages come to
  roughly 10–15 KB at 480px. A noisy scanned page can reach about 270 KB, which is the cost of PNG
  on photographic content.
- **Tall pages** (receipts) are cut at height = 1.5 × width, keeping the top of the page. The
  card's 4:3 window shows only the top of a page anyway.
- **Access.** A thumbnail shows the first page, so it is as sensitive as the PDF. It sits under the
  organisation's prefix, it is never public, and only the tenant-scoped list returns it, as
  `thumbnailUrl`. The URL comes from `presignCacheable`: the signing time is rounded down to a
  15-minute window and the URL is valid for 30 minutes, with `Cache-Control: private,
  max-age=900`. Every list request within a window gets the same URL, so the browser can cache the
  image instead of downloading it again on each visit.
- **Deletion.** Deleting a document (soft delete) also deletes its thumbnail, because the
  thumbnail only serves the list. Retention purge deletes it together with the original. Deleting
  a workspace already removes everything under `org/{orgId}/`.
- **UI.** The layout is saved in the `sahihi-documents-layout` cookie, so the URL stays clean. A
  link with `?layout=list|grid` wins over the cookie and is saved too. Switching layout keeps the
  current page. The switch is an Arc `SegmentedControl` (List / Grid) in the toolbar. The grid
  follows Google Drive's file tiles (`components/app/documents/document-card.tsx`): tonal cards
  with no border; a title row with the PDF icon, the name and a ⋮ menu (ADR 0034); the top of the
  first page in a 4:3 window (Extend `FileThumbnail` inside `.on-paper`, so it stays white in both
  themes); and one meta line. Columns fill automatically at a minimum of 13rem, with relaxed gaps.
  The grid sits outside a `Panel` (cards inside a card would nest) and does not stagger in,
  because people open this page many times a day (docs/ui.md → Motion).
## Consequences
- A document has no preview for a few seconds after upload. The card shows the file icon and the
  image fades in on a later visit. Nothing refreshes the page by itself.
- A thumbnail URL stays valid for up to 30 minutes, instead of 5 for the PDF itself.
- Rendering at a different size, or switching to WebP, means re-rendering every document: clear
  `thumbnailKey` and let the sweep pick them up.
- `lib/pdf-thumbnail-utils.ts` (browser rendering) is still used only by Extend's own components.
