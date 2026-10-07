# 0008: Compose the signature capture dialog in the app

- **Status:** accepted
- **Date:** 2026-09-28

## Context
The signing surface needs a dialog to draw, type or upload a signature or initials and produce a PNG
(docs/signing-flow.md → Signing surface). Extend ships two such dialogs, and neither is reusable
as-is:
- `SignatureDialog` in `components/blocks/e-signature.tsx` isn't exported (the block only exports the
  demo `ESignatureBlock`), and it only supports drawing.
- `PdfEditorSignatureDialog` in `components/extend/pdf-editor-dialogs.tsx` is exported but reads
  `usePdfEditor()` and EmbedPDF's signature capability, so it only works inside a mounted
  `PDFEditor`. Signers get the lighter `PDFViewer` (ADR 0006).

Exporting the block's dialog would mean editing vendored code (ADR 0003, UI rule 2), and it still
wouldn't cover type or upload.

## Decision
Compose `components/app/signing/signature-capture-dialog.tsx` from coss parts: `Dialog`, `Tabs`,
`Input`, `Select`, `Button` and `Alert`.
- **Draw** uses `signature_pad`, the same library (and dependency) Extend's dialog uses.
- **Type** renders the name to a canvas with Extend's exported `PDF_EDITOR_SIGNATURE_FONTS` and
  `PDF_EDITOR_DEFAULT_SIGNATURE_FONTS_URL`, so typed signatures look the same as in the editor.
- **Upload** accepts PNG or JPG, up to 5 MB, scaled to at most 1200×400.
- Every output is cropped to its inked area (`inkBounds` in `lib/signing.ts`, unit-tested) and must
  pass `isAcceptablePng` (the API's data-URL cap) before it can be adopted.
- The ink colour is a fixed dark value, because it's drawn into the PNG that is stamped on white
  paper, not into themed UI.

No vendored files change.

## Consequences
- We own a small amount of canvas code. The pure parts (trimming, size checks) are tested; the
  canvas wiring is checked in the browser.
- The typed-signature fonts load from Google Fonts when the dialog opens. A future CSP (roadmap P5)
  must allow `fonts.googleapis.com` and `fonts.gstatic.com`, or the fonts must be self-hosted.
- If Extend exports a standalone, controlled signature dialog, revisit this ADR.

## Amendment (2026-10-07, ADR 0023)
The dialog is now composed from Arc parts (`Dialog`, `Tabs`, `Input`, `Select`, `Button`, `Alert`).
**Draw** uses Arc's `SignaturePad` (pressure-aware ink, undo, its own cropped PNG export) instead of
`signature_pad`; the PNG blob is read into a data URL and must still pass `isAcceptablePng`. Type and
Upload are unchanged and still crop with `inkBounds`.

