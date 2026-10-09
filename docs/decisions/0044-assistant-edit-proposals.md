# 0044: Assistant edit proposals

- **Status:** accepted
- **Date:** 2026-10-09

## Context
The assistant could fill blanks but not change wording. Letting it edit the text directly would
make silent changes and invented terms possible; the product rule is that every AI change is
reviewed and every accepted change is a version.

## Decision
- **Proposals, not edits.** Two server tools store a `GeneratedDocumentProposal` (replace or delete
  one section; insert sections). The person accepts or rejects it; accepting appends a version
  authored by the AI, with the proposal claimed in the same transaction.
- **A text format for the model, nodes for the document.** The model writes paragraphs and lists of
  strings with `{{key}}` blanks and `**bold**` / `*italic*`; the server converts them
  (`draftSection`). Asking a model for editor JSON was verbose and fragile; this format can only
  express what a section may hold.
- **Section granularity and staleness.** A proposal names the section it changes; it goes out of
  date only if that section changed since (or a new blank's key was taken), so answers and edits
  elsewhere don't invalidate it. Out-of-date proposals are reported and refused, never merged.
- **Refuse invented specifics.** Emails, phone numbers, amounts, dates, percentages and numeric
  durations in proposed text must appear in what the person said; otherwise the proposal is
  refused and the model is told to use a blank. Names and jurisdictions are left to the
  instructions and the person's review: no pattern tells them apart from wording.
- **No signature sections.** Proposals can't touch sections that hold signature blocks; signers and
  fields are a separate item.
- **Diff in the chat, badge in the editor.** The card shows a word diff of plain text (blanks by
  label); the editor marks the section. An inline diff inside the editor was left out: it would need
  a second document state in TipTap for little gain.

## Consequences
- The specifics guard can refuse legitimate generic wording with digits ("within 30 days") until
  the person says it; the model is told to use a blank and ask, which is the intended behaviour.
- Proposals keep their payload and base version, so the before/after text is stable even after
  later versions.
- Whole-section replacement means a one-word change re-sends the section; fine at this size.
