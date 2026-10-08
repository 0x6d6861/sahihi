# 0039: Drag and drop and multi-select on All files

- **Status:** accepted
- **Date:** 2026-10-08

## Context
Folders hold documents, envelopes and templates (ADR 0038), but moving was one item at a time
through the ⋮ menu's "Move to…", and uploading was one PDF through the Upload dialog. Drive users
expect to drag files onto folders, pick several at once, and drop files from the desktop.

## Decision
- **dnd-kit (`@dnd-kit/core`, pinned) for drags inside the page.** Native HTML5 drag and drop has
  no touch support and no screen-reader announcements. dnd-kit gives mouse (after 6 px, so clicks
  still open items), touch (after a 250 ms press) and live-region announcements. Only the core
  package; no sortable, no modifiers package (the overlay's "beside the cursor" modifier is local).
- **No keyboard drag.** Rows are table rows full of links; making each one a drag handle adds a
  tab stop per row and a 2D keyboard drag over a list is awkward. The keyboard path is the row
  checkbox plus the selection bar's **Move…** (the existing `MoveToFolderDialog`, now multi-item).
- **Selection.** A checkbox column in the list (coss `TableCell` sizes a checkbox cell on its own)
  and a checkbox over the type icon on cards. Shift-click selects a range, the header checkbox the
  page, Esc clears. A drag that starts on a selected item carries the whole selection. Selection
  resets when the folder, page or filters change. Only items the user may move can be selected.
- **Drop targets:** folder rows and cards, and the breadcrumb's top level and ancestors. Arc's
  `Breadcrumb` takes items, so the drop targets attach to its rendered links (`BreadcrumbDrops`).
- **One bulk endpoint, all or nothing.** `POST /api/files/move { items: {kind, id}[], folderId }`
  (≤ 100 items). Any item missing (404, also for another workspace's ids), not the caller's to move
  (403), a folder into its own subtree or too deep (400) or a folder name clash (409) moves nothing.
  Items picked along with a folder they're in (select-all, a search) stay in it and travel
  with it, so a move never flattens the tree (`isInsideMovingFolder`).
  One `updateMany` per type in one transaction. Organisation only, so no audit event (ADR 0038).
  The response lists where each item was, so the success toast offers **Undo**.
- **Drop onto a file makes a folder.** Dropping items on a document, envelope or template (not a
  folder) creates a folder where that file sits, holding the file and everything dragged, like
  iOS. `POST /api/files/group { items, parentId }` creates it and moves them in one transaction,
  with the same checks as a move plus `folder:create`. It is named "New folder", or the next free
  "New folder N" among its siblings; people rename it from its ⋮ menu (asking for a name mid-drag
  would interrupt the gesture). Undo moves the items back and deletes the folder.
- **Desktop files use native drag events.** dnd-kit doesn't see files from the OS. A window
  listener reacts only when `dataTransfer.types` has `Files`, finds the nearest
  `[data-drop-target]` (folder rows, cards, crumbs) or falls back to the open folder, and uploads
  each PDF in turn through `uploadPdf` (≤ 20 per drop; non-PDFs and oversize files are skipped
  with a reason). It stands aside while a dialog is open and on the empty page, whose drop zone
  takes files itself.

## Consequences
- New dependency `@dnd-kit/core` (web only).
- Drag and drop is on All files only. The Documents, Envelopes and Templates pages share the
  folder rows and cards, which render without drag and drop outside `FilesDnd`; wrapping those
  pages is a small follow-up.
- Desktop folder drops (a directory) are not walked; only files are uploaded.
