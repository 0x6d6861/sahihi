# 0043: Rich-text editor for generated documents

- **Status:** accepted
- **Date:** 2026-10-09

## Context
ADR 0042 shipped generated documents with fixed wording: people could fill blanks but not change a
clause. Editing must keep the document model intact (stable section ids, blanks as references,
signature fields bound to roles), must render identically in the PDF, and must not lose answers the
person gives the assistant while they're typing.

## Decision
- **TipTap (headless) with the document model as its schema.** Custom nodes for the document,
  sections and blanks; StarterKit with everything the model lacks switched off (headings, quotes,
  code, links, hard breaks); one-paragraph list items; TipTap's table with paragraph-only cells and
  no resizing. Like assistant-ui, TipTap renders nothing of its own: every control is Arc or coss,
  styled with tokens. No Pro extensions.
- **Signature blocks are atoms.** The editor holds one node per block and carries its caption and
  fields in an `items` attribute; `lib/generator-editor.ts` converts both ways and validates with
  `DocContentSchema`, so nothing invalid is saved. Editing inside a block (and adding signers or
  fields) is left to the assistant-signers item.
- **Numbers from a CSS counter**, not stored and not computed per node view, so they follow the
  order of sections as they move. The editor's few styles are Tailwind utilities on its container
  (no CSS module, no injected stylesheet: `injectCSS: false`).
- **Every autosave is a version**, debounced (1.2 s) and serialised with the field editor's
  `useAutosave`. A text save applies on top of the latest version when only blanks or signers
  changed since its base, because those live outside the text; a concurrent text change is a 409.
- **Real italics.** Noto Sans Italic and Bold Italic (2.015, hinted build, OFL) join the bundled
  Regular and Bold. Tables render as equal columns with hairline borders; rows never split.

## Consequences
- Pasting from Word keeps text, bold, italic, underline, lists and tables, and drops the rest.
- Version count grows with editing (one per pause in typing). Fine for now; a history view or
  pruning of unreferenced versions may want coalescing later.
- Merged cells, nested lists, headings inside sections and column widths aren't supported by the
  model or the renderer; the editor doesn't offer them.
