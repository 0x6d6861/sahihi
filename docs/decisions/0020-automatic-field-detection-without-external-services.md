# 0020: Automatic field detection without external services

- **Status:** accepted
- **Date:** 2026-10-05

## Context
Placing every signature, date and name field by hand is the slowest part of preparing an
envelope. We considered sending documents to a hosted model (Mistral OCR or Document AI) to find
the signers and field positions. Two things argue against that as the first step:

- **Data:** contracts carry personal data. A third-party processor has to be listed as a
  subprocessor, covered by a DPA (Kenya DPA, `docs/data-retention.md`) and enabled per organization.
- **Precision:** LLMs are good at meaning (whose signature line is this?) and poor at exact
  coordinates. A field a few points off lands on the wrong line.

Many PDFs already say where the fields are: fillable forms carry AcroForm widgets with exact
rects and descriptive names ("Buyer Signature", `form1[0].Seller_Date[0]`).

## Decision
Detect fields locally, in tiers, without any external service. Every detector is a pure function
in `@sahihi/core` over data parsed by `@sahihi/pdf`, and produces `FieldSuggestion`s
(`field-suggestions.ts`). `GET /documents/:id/field-suggestions` runs them on demand, merges the
results (`mergeSuggestions`: anchors win over form fields where they overlap) and stores nothing.
**Tiers 1a, 1b and 1c ship now:**

1. **Form import (1a).** `readFormWidgets` lists the PDF's AcroForm widgets (kind, name, page,
   /Rect). `suggestFieldsFromForm` maps them to normalized rects with `fromPdfRect` and types them:
   signature widget → SIGNATURE, checkbox → CHECKBOX, text by name (date → DATE_SIGNED, email,
   initials, printed name → NAME, sign → SIGNATURE, else TEXT). It also reads a **role hint** from
   the name minus type words ("Buyer Signature" → "buyer").
2. **Anchor tags (1b).** Senders type `{{<role>:<type>[:optional|:required]}}` into their source
   document, e.g. `{{s1:signature}}` or `{{buyer:date}}`. `readPageText` extracts each page's text
   and measures glyph boxes only for the tag ranges (`anchorRanges`). `suggestFieldsFromAnchors` finds the tags and places a field from the
   tag's bottom-left corner, at least `ANCHOR_MIN_SIZE` for its type.
   - **Text extraction uses PDFium**, through `@embedpdf/pdfium`: the WASM build the web PDF viewer
     already ships, pinned to the same version. No new package enters the lockfile. pdf-lib can't
     read text, and pdf.js would be a second PDF engine with its own worker setup. The 4.6 MB
     `.wasm` is loaded once per process and bundled like the fonts (`with { type: "file" }`).
3. **Text-layer rules (1c),** only when 1a and 1b find nothing, because they're a guess.
   `suggestFieldsFromText` pairs a **label** with a **line** on the same page:
   - **Labels:** `Signature`/`Signed`/`Sign here`/`By:`, `Initials`, `Date`/`Dated`,
     `Name`/`Printed name`, `Email`. A label word counts only if it's followed by a colon, sits on
     a row of at most 60 characters, or shares its row with a blank, so running text doesn't match.
   - **Lines:** typed blanks (`____`, dot leaders), plus thin drawn paths that PDFium reports
     (`readPageText(…, { lines: true })`).
   - **Pairing, in order:** a line to the right on the same row, where the nearest label wins
     ("Signature Date: ____" is a date); then a line just above the label; then a `Label:` that
     ends its row gets a field right after it. The field sits on the line, with the line's width
     and a height set by its type.
   - **Roles:** a party word to the left on the label's row, else the nearest one above it in the
     same column, within 20% of the page height. Party words are a fixed list (landlord, tenant,
     buyer, seller, company, …) plus terms the document defines (`(the "Supplier")`). They must be
     capitalized, because lowercase mentions are body text.

   The scanner only measures pages that could hold a field: one with a label plus a drawn rule, a
   blank, or a `Label:` ending a row. Party words in body text are everywhere, and measuring them
   all cost ~400 MB on a 300-page contract.
4. **Suggestions, not fields.** The editor's **Detect fields** button adds them as ordinary editor
   fields. They're autosaved like hand-placed fields and can be moved, reassigned or deleted.
   `assignSuggestions` picks the owners:
   - numbered roles (`s1`, `signer2`) go to that position in the recipient list;
   - otherwise, with two or more named roles, distinct roles go to recipients in list order;
   - everything else goes to the active recipient.

   Fields on top of existing ones are skipped, so pressing it twice is harmless. Nothing is sent
   without the sender.

Later tiers, same shape:

- **2. Scans:** local OCR (tesseract.js) producing the same `PageText`, feeding 1b and 1c.
- **3. Self-hosted open-weight model** for labelling only, if the rules leave a real gap. This
  needs a GPU host, which Railway doesn't offer.

## Consequences
- No external processor and no new env var. It works on every existing document because
  detection runs on demand, not at upload.
- Flat PDFs are covered when their signature lines are labelled. Unlabelled lines, and lines inside
  form XObjects (which PDFium's page-object walk doesn't enter), give nothing.
- 1c is heuristic. Expect a missed field or a stray one on unusual layouts; the sender reviews
  every suggestion. Roles come from layout, so a two-column block works only if PDFium keeps the
  columns' glyph positions, which it does.
- Anchor text stays in the signed PDF. Senders should set it in white or tiny text, as with
  DocuSign anchors. The stamped field covers most of it.
- Role hints from form field names are a guess. Generic names (`Text1`, `Signature 3`) carry no
  role and go to the active recipient, so the sender must check ownership. The success toast says
  so. Numbered anchor roles are exact.
- The original form widgets stay in the PDF and are flattened at finalize (`stampFields`).
- Each click downloads the original (≤ 25 MB) and reads every page's text in PDFium. Glyph boxes
  are measured only for the tag ranges: ~0.4 s for 300 dense pages, against 2.7 s and ~750 MB
  when every glyph was measured. With 1c, 300 pages take ~0.6 s and +70 MB, or +160 MB when
  every page has drawn rules (table borders). The
  WASM heap grows to the largest document seen and stays that size for the life of the process.
  Cache results per `Document.sha256`, or move detection to the worker, if latency or memory
  shows up.
