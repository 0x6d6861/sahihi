# 0024: "Prepare document" as the draft editor's first step

- **Status:** accepted
- **Date:** 2026-10-07

## Context
Preparing a PDF (redact, rotate, reorder or delete pages, fill its form fields) lived only on the
document's own page (`/documents/:id/prepare`) and saved a new document there. A sender who
noticed a problem while setting up an envelope had to leave the draft, prepare the document, make
a new envelope from the prepared copy and redo the recipients. The envelope's document could not
be changed at all.

## Decision
- The draft editor (ADR 0021) gets a fourth step, first and optional: **Prepare document**
  (`?step=document`, `envelope-editor/prepare-step.tsx`), then Recipients → Add fields → Preview.
  A new draft opens on it; a draft with a signer or approver still opens on Add fields. "Skip"
  moves on without changes.
- The step reuses `PrepareDocument` (same Extend `PDFEditor` configuration #2, same upload with
  `sourceDocumentId`, so the server re-inspects and re-hashes the bytes). Its new `onSaved` prop
  replaces "open the new document" with **Save and use**: flush the field autosave, then
  `PUT /api/envelopes/:id/document { documentId }`.
- `replaceEnvelopeDocument()` (`@sahihi/envelopes`) points a DRAFT at another READY document of
  the workspace, **removes every placed field** (pages may have moved, turned or gone, so no
  position can be trusted; the confirmation says how many), and writes a new audit event
  `envelope.document_replaced` with both document ids and hashes, since `envelope.created`
  recorded the first one. The original document is untouched and stays in the library.
- Same layout as the fields step: the editor full bleed, with a fixed 288px panel on its right
  (what the step does, the new file name, what happens to placed fields, **Save and use** and
  **Skip this step**); below `lg` the panel opens as a drawer from a bar above the editor. The
  documents page's prepare screen uses the same panel inside its bordered frame.
- The step is mounted only while shown (the full editor is heavy and holds no draft state), so
  unsaved edits in it are dropped when the sender moves to another step. The field editor is
  keyed by document id so it starts over on the new document.
- `/documents/:id/prepare` stays for preparing a document outside an envelope.

## Consequences
- An envelope's document can change while it's a DRAFT; the audit trail shows when and from what.
- Each "Save and use" adds a document to the library ("… (prepared).pdf").
- Templates and the public API can't replace a document yet; they'd call the same service.
