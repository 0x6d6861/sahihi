# 0052: Word documents: converted to PDF on upload, imported as Word shows them

- **Status:** accepted
- **Date:** 2026-10-14

## Context
Most contracts start life in Word, but the Documents upload took PDFs only, so senders had to
export a PDF before they could send anything. Drafting already imported .docx files (ADR 0049),
but the reader only saw formatting set directly on the text: bold or italics from a style
(Strong, Emphasis, a firm's "Defined term"), lists made by Word's List Number / List Bullet
styles, headings from custom styles based on Heading 1, and the numbers Word prints ("2.1",
"(a)") were all lost, so an imported contract read differently from the file the person brought
and its cross-references ("see clause 2.1") stopped matching.

## Decision
**Conversion on upload (Documents and the public API).**
- `POST /documents/uploads` and `POST /api/v1/documents` take the .docx MIME type as well as PDFs.
  The Word file is an upload like any other (presigned PUT, staged in Sahihi's bucket for a
  workspace with its own storage), at `documents/<id>/source.docx`. On `complete` the bytes must
  be a Word body (`sniffImportFormat`), the document goes **`CONVERTING`** (202) and a
  `document.convert` job is queued after the update commits. `Document.convertedFrom = DOCX`
  records it; the name becomes the PDF's ("Lease.docx" → "Lease.pdf").
- **LibreOffice in the worker** (`convertDocxToPdf`, `@sahihi/pdf`), on its own queue with one
  conversion at a time per worker. The PDF then goes through exactly what a PDF upload does
  (`inspectPdf`, SHA-256, stored at `original.pdf` in the workspace's storage, thumbnail) and the
  document becomes READY. The Word file is discarded; only the PDF is kept, since that's what is
  signed, hashed and certified.
- **One clear version is signed.** A file that still has tracked changes is refused with "Accept
  or reject them in Word": LibreOffice prints them with their markup, deleted text included, and
  picking a version for the sender (as the Drafting import does, which skips deletions) would put
  words in front of signers the sender never chose. Comments are left out of the PDF.
- **The file is untrusted, so it's cleaned and fenced.** `sanitizeDocx` refuses macro-enabled,
  encrypted and old .doc files and zip bombs, drops external relationships other than hyperlinks
  and blanks fields that pull content in (INCLUDEPICTURE, INCLUDETEXT, DDE…). LibreOffice 24.2
  fetched nothing from such a file even unsanitised in our test; the cleaning is there for other
  versions and settings. LibreOffice runs
  headless, with a fresh profile per conversion (macros off, links from documents blocked), an
  environment without the worker's secrets, in its own process group, killed after 90 seconds.
- **Failure is visible and final.** A file LibreOffice or the PDF check refuses fails the
  document with a reason the sender reads; machine errors retry once, then fail. The uploads
  sweep fails conversions still waiting after an hour and re-queues lost jobs.
- The web waits for the conversion on a single upload (progress "Converting to PDF…"); a dropped
  batch doesn't wait, and Files refreshes itself while anything converts.

**Import fidelity (Drafting).** `readDocxBlocks` resolves formatting the way Word does: document
defaults, paragraph style and character style (following `basedOn`, toggles cancelling as in
Word), then the run's own; capitals formatting comes in as capitals and hidden text is left out.
Lists and headings numbered by a style count, and Word's numbering is counted as Word counts it
(continuing lists, restarts, legal numbering, letter and roman formats). The number Word prints
travels as the block's `label`, and `importContent` keeps the source's number wherever Sahihi's own
would differ: a heading "2.1 Scope" becomes an unnumbered section titled with its number, an
item numbered "1." (Sahihi prints "(a)") a paragraph starting with "1.". Merged cells keep their
columns and header rows become header cells. A document with no heading styles gets headings from
short bold or capitalised lines, and a short centred or bold first line becomes the title.

## Consequences
- The worker image needs LibreOffice and metric-compatible fonts (docs/pdf-pipeline.md → Word
  uploads); without them Word uploads fail with "can't be converted right now".
- Conversion fidelity is LibreOffice's: fonts that aren't installed are substituted (metric
  compatible ones keep the line breaks), and unusual layouts can move. The sender sees the PDF
  before sending, and that PDF is what everyone signs.
- Senders with leftover tracked changes have to clean them up in Word first.
- A Word file isn't stored, so it can't be downloaded again from Sahihi.
- Imported documents keep more literal numbers in their text; those don't renumber when the person
  reorders clauses. That's the price of cross-references staying true to the source.
- The draft model still has no alignment, fonts, colours, nested lists or merged cells: those stay
  out of an import.
