# 0006: Where Extend's PDFEditor is used, and where it isn't

- **Status:** accepted (amends 0003)
- **Date:** 2026-09-26

## Context
Extend UI's `PDFEditor` (EmbedPDF) adds thumbnails, search, a full toolbar, redaction, page
organization and form filling on top of `PDFViewer`. It also has a `sign` mode and a form-design mode.
Reading its source showed:
- the form-design tools are text, checkbox, radio, dropdown and list box, with **no signature field**;
  widgets are written into the PDF bytes, and fields aren't tied to recipients
- `sign` mode lets the user place a signature anywhere and produces the final PDF in the browser;
  saved signatures default to localStorage
- `renderPageOverlay` provides `{ pageNumber, pageWidth, pageHeight, scale, rotation }` inside the
  page's rotate wrapper. There are no `onPagePointer*` props

## Decision
| Surface | Component | Mode |
|---|---|---|
| Field placement (sender) | `PDFEditor` | view-only shell (all editing features off) + our field layer via `renderPageOverlay` |
| Prepare document (sender, optional) | `PDFEditor` | redact, pages, forms on. Output is saved as a **new** Document |
| Signing (recipient) | `PDFViewer` | our fields + signature dialog. Values only |

Always use `persistSignatures={false}` and `showUpload={false}`. `sign` mode and client-produced PDF
bytes are never used for envelopes.

## Consequences
- A better sender experience (thumbnails, search) at no cost to evidence integrity. Originals stay
  immutable, and prepared documents have their own hash and lineage (`sourceDocumentId`).
- The editor is heavy (about 20 plugins), so it's loaded dynamically on sender routes only. Signers
  get the lighter viewer.
- Keyboard shortcuts must be isolated between the editor and our field layer.
- The field layer owns its pointer handling, since the editor doesn't expose page pointer callbacks.
