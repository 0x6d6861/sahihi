# 0022: Document folders on the Documents page

- **Status:** accepted
- **Date:** 2026-10-07

## Context
The Documents page is the app's home. A workspace with many PDFs needs a way to group them
(by client, by department) and to find one again (search, status, uploader, date). DocuSign-style
apps do this with folders, a breadcrumb and a filter bar.

## Decision
- A `Folder` model, org-scoped, nested through `parentId` (max 8 levels), and an optional
  `Document.folderId`. Folders are **organisation only**: no envelope, template, certificate or
  signing code reads them, so moving a document never touches evidence.
- Sibling names are unique case-insensitively, checked in the API (a DB unique index can't cover
  `NULL` parents in Postgres without a partial index, and the check doubles as a nice 409).
- **Deleting a folder never deletes documents.** Its documents and subfolders move up to its parent
  in one transaction. Soft-deleted documents move too, so the FK's `SET NULL` can't drop them to the
  root behind our back. The self-relation is `NO ACTION` (checked at statement end) so an org delete
  can still cascade through a folder tree.
- Permissions follow the template pattern: everyone creates folders; renaming, moving and deleting
  a folder is its creator's, or any with `folder:manage-any` (owner, admin). Moving a document
  follows the document delete rule.
- Search (`q`) spans every folder; the filters (status, uploader, period) apply to either view.
  Page state lives in the URL so the page stays a Server Component and back/forward work.

## Consequences
- The API loads a workspace's whole folder tree for each folder call (paths, cycle and depth
  checks). That's fine for hundreds of folders; a closure table or `ltree` would be the next step.
- Name uniqueness is check-then-insert, so two simultaneous creates can still produce twins. Harmless
  (both are usable and renameable).
- Folder contents are not part of the workspace export yet; documents export as before.
