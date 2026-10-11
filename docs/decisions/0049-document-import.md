# 0049: Starting a draft blank, or from the person's own document

- **Status:** accepted
- **Date:** 2026-10-11

## Context
A generated document could only start from one of the reviewed starters or a workspace template
(ADR 0042, 0046). People who already have a contract, as a PDF in Files or a Word file on their
computer, couldn't bring it into Drafting, and people whose document no starter covers had no way
in at all.

## Decision
- **Three new starting points:** a blank document (`{ blank: true }`), a READY PDF from the
  workspace library (`{ documentId }`), and a PDF or Word (.docx) file uploaded to
  `POST /generated-documents/import`. The `starter` column records `blank` or `import`, so the
  assistant and the web know how a draft began; no schema change.
- **Imports are word for word and rule based, never rewritten by the model.** A reader turns the
  file into neutral blocks (headings, paragraphs, list items, tables; `packages/pdf/src/import/`),
  and `importContent` (`packages/core/src/generation/import/`) turns those into sections. A PDF
  keeps no structure, so `pdfTextToBlocks` goes by layout habits (numbered and capitalised
  headings, repeated headers and footers, run-on lines); Word files keep their heading styles,
  numbering, bold/italic/underline and tables. The person signs what they brought, so an AI
  restructuring that could drift from the source was ruled out; slower, costlier and harder to
  trust.
- **Blanks are proposed afterwards, from the document's own text.** A new tool, `propose_blanks`,
  names exact text in the document; accepting turns every whole-word occurrence into a blank whose
  value is that text (`source: "import"`). The wording doesn't change; the value becomes visible
  and editable. Because the value comes from the document, it needs no evidence from the chat
  (`isValueAttested` is for values the model wants to add). Signers come from the existing
  `define_signers`.
- **Uploaded files aren't stored.** The draft is the source, and finalising renders a new PDF. A
  library PDF stays where it was, unchanged. This keeps no second copy of the person's file to
  retain, export or delete.
- **Limits:** 10 MB per file and 60,000 characters of text. The whole document goes into every
  assistant turn; a longer one would make each reply slow and costly. A scan (no text layer) is
  refused with `no_text`, as is a password-protected PDF (`encrypted`).
- **The file type comes from its bytes** (`%PDF`, or a ZIP holding `word/document.xml`), never its
  name or the browser's content type.

## Consequences
- PDF tables and two-column layouts come in as plain paragraphs; the person tidies them in the
  editor. Word text boxes, headers, footers, footnotes, field codes and images are left out;
  tracked deletions are dropped and insertions kept.
- Signature lines in the source are dropped (lines of underscores or dots, and bare "Signature" /
  "Date" captions): signature blocks only come from the Signers tab, so the PDF's fields line up.
- An imported document starts with one signer (`Signer 1`) and no fields, so finalising asks for
  a signature field until the person or the assistant sets the signers.
- Starters stay curated: a blank or imported document is never a starter, though it can be saved
  as a workspace template like any draft.
