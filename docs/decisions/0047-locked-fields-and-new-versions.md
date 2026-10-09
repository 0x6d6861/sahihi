# 0047: Locked fields and new versions for finalised AI documents

- **Status:** accepted
- **Date:** 2026-10-09

## Context
Finalising a generated document prints signature lines and captions into the PDF and places the
envelope's fields on them. In the envelope editor those fields could be dragged off their lines,
deleted, or given to another recipient, and the document could be swapped by "Prepare document",
leaving lines nobody signs. A finalised document also can't change, so there was no way to fix a
mistake found after finalising or after sending.

## Decision
- **A `locked` flag on `Field`**, set by finalising. Locked fields stay put: the editor's reducer
  ignores every action on them except selection, the save payload leaves them out, and the API
  keeps them whatever the payload says. A flag rather than "fields on a generated document",
  because people may add their own fields to that document and those stay editable.
- **Guards at the API**, not only in the editor (409 `locked_fields`): replacing fields keeps locked
  rows; a recipient who owns locked fields can't be removed or made a viewer; the document can't be
  removed or replaced. Contacts can still change, since names and emails aren't printed.
- **New version instead of re-finalising.** Changes go through a new DRAFT copied from the
  finalised version (`previousId`), finalised into a new PDF and envelope. The old envelope is left
  alone; the person voids or deletes it. Re-finalising into the same draft envelope would need to
  swap its document and fields in place; a new version covers both "still a draft" and "already
  sent" with one rule and keeps every finalised PDF intact.
- **One new version per document**, so the history is a line, not a tree; asking again opens it.

## Consequences
- A sent envelope and its PDF never change; the corrected document goes out as a new envelope.
- Envelope templates saved from such an envelope copy its fields unlocked (templates have no lock).
