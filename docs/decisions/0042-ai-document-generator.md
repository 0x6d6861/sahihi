# 0042: AI document generator

- **Status:** accepted
- **Date:** 2026-10-09

## Context
Members want to draft documents (NDAs, offer letters, resolutions…) with an AI assistant and send
them for signature without leaving Sahihi. An assistant that writes prose freely invents names,
amounts and jurisdictions, and a body that mentions a signer's email can disagree with the envelope
that is actually sent. The signing pipeline also needs exact field positions on a PDF that never
changes once READY.

## Decision
- **Structured source, immutable versions.** A generated document is a ProseMirror-compatible tree
  with sections (stable ids, computed numbers), atomic blanks that point at a value in
  `variables`, and signature fields grouped by signer role. Signer contacts live only in `roles`.
  Every change appends a `GeneratedDocumentVersion` (UPDATE refused by a trigger) based on the
  latest version; a stale base is a 409.
- **The assistant only acts through tools, checked on the server.** `ask_questions` is answered by
  the person in a question card; `set_variables` is refused unless each value is something the
  person said (`isValueAttested`). The server rebuilds the document context from the database every
  turn and ignores client-supplied instructions.
- **Provider-agnostic.** Vercel AI SDK with a provider registry; `AI_MODEL=provider:model`.
  Workspaces opt in (`aiEnabled`), because document text leaves Sahihi.
- **pdf-lib layout engine** (`packages/pdf/src/compose/`) instead of headless Chromium or
  react-pdf: it reuses the bundled Noto fonts and needs no browser in the API image, its output is
  byte-for-byte deterministic, and the layout knows every field's rect, which maps onto `Field` with
  `fromPdfRect`. The cost is simple typography (one column, greedy line breaking, Latin/Greek/
  Cyrillic only, ADR 0009); tables and italics come later.
- **Finalise = a READY `Document` + `createEnvelopeFromDocument`.** The PDF is a first-class
  document; the existing editor and Review & send take over. The generated document locks at
  finalise (stricter than "at send"): its PDF is already immutable, so a change needs a new
  document anyway.
- **assistant-ui under Arc.** The chat uses assistant-ui's headless primitives and toolkit
  (`defineToolkit` + `Tools` for tool renderers), styled only with Arc components and tokens. It
  pulls in Radix as a dependency, like vendored Arc items; app code still never imports Radix.
  `humanTool()` is not used: it needs assistant-ui's compiler, so the server declares
  `ask_questions` without `execute` and the card supplies the result with `addResult`.
- **No rich-text editor yet.** The first slice shows the structure read-only, with blanks editable
  in place. TipTap with custom nodes (sections, blanks, fields) comes with assistant edit proposals.

## Consequences
- Adding a starter is a code change with review, not data. Starters must declare every blank they
  use; a test enforces it.
- The provenance check is literal: "Kenyan law" doesn't attest "Kenya". The assistant asks instead,
  which costs a question but never guesses.
- A layout change moves field positions; the coordinate snapshot test makes that visible.
- The envelope editor still lets the sender move a generated document's fields after finalising.
  Locking them there is a follow-up.
