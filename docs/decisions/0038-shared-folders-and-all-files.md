# 0038: Shared folders and the All files page

- **Status:** accepted
- **Date:** 2026-10-08

## Context
Folders (ADR 0022) and labels (ADR 0025) only held documents. A workspace that works per client or
project also wants that client's envelopes and templates in the same folder, and one place to find
anything: Drive shows every kind of file in one list. The Documents, Envelopes and Templates pages
(ADR 0036) each search only their own type.

## Decision
- **One folder tree for three types.** `Envelope` and `Template` get `folderId` (`SET NULL`),
  `color` and `tags`, like `Document`. A folder holds documents, envelopes and templates together.
  `GET /folders` counts each type (`documentCount`, `envelopeCount`, `templateCount`). Deleting a
  folder moves all three up to its parent in the same transaction.
- **Organisation only, not evidence.** Signing, certificates, webhooks and the audit trail never
  read a folder or a label, so moving or labelling an envelope is not a state change: it needs no
  `assertTransition` and writes no audit event, in any status. `PATCH /envelopes/:id/labels` takes
  `folderId`, `color` and `tags` and nothing else, because a sent envelope's title is evidence.
  Templates use their existing `PATCH /templates/:id`. Both follow the "manage" rule (creator,
  admin, owner).
- **Type pages browse folders too.** Documents, Envelopes and Templates all list one folder (the
  root when none is open). Search, tag and colour look in every folder, as on Documents. The
  folder breadcrumb, cards and rows are shared (`components/app/folders/folder-section.tsx`). The
  filters for each type live in one place (`apps/api/src/lib/list-filters.ts`).
- **All files (`/files`) is home.** It is the first nav item and where sign-in, onboarding and a
  workspace switch land. `GET /api/files` returns each type's own list row plus `kind`
  (`apps/api/src/lib/list-items.ts`), so the page reuses `DocumentCard`, `EnvelopeCard`,
  `TemplateCard` and their ⋮ menus. The type pages stay as one-type views.
- **One Status chip, grouped.** Envelope stages first (Drafts, In progress, Completed, Closed),
  then document states (Document ready, Document failed). Templates have no status. A status
  belongs to one type, so picking one also sets the Type chip. A Type that doesn't fit the status
  drops the status rather than showing nothing (`fileKindsFor` in `@sahihi/core`).
- **Merged paging.** For page N, each type reads its first N × 25 rows; the rows are merged newest
  first (ties by id, descending, like the type lists) and the page is sliced (`mergeNewestFirst`).
  That keeps each type's own query, filters and Prisma includes, and the page is exact. The page is
  capped at 40 (1,000 rows).

## Consequences
- Deep pages of All files cost more: page 40 reads up to 1,000 rows of each type. If people page
  that far, switch to a keyset cursor per type or a `UNION ALL` over `(kind, id, createdAt)`.
- Envelopes and templates inside a folder no longer show at the root of their type page. Search
  still finds them anywhere, and the root shows the folder they're in.
- Envelopes created from a template, by bulk send or through the public API land at the root.
  `POST /envelopes` and `POST /templates` take a `folderId`; nothing else sets one yet.
- Folder contents are still not part of the workspace export (ADR 0022).
