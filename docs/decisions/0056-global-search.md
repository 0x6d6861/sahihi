# 0056: Global search with Arc's command palette

- **Status:** accepted
- **Date:** 2026-10-14

## Context
Finding something meant opening All files and searching there; settings pages and actions had no
shortcut at all. Arc ships a free `command-palette` block (search input, grouped results, keyboard
navigation). It filters the `items` it's given in the browser and has no prop for the query, async
results or loading.

## Decision
- **Top bar:** the nav pill moves left, next to the workspace menu; a search-field-shaped trigger
  takes the middle (`GlobalSearch`, `components/app/app-shell/global-search.tsx`). It and ⌘K /
  Ctrl+K anywhere open the palette as a dialog. Arc's `DialogContent` always draws a titled
  header around its children, which put a card inside a card, so the dialog is coss's
  `DialogPopup` (Base UI: backdrop, focus trap, focus back to the field) with its border,
  background, close button and padding removed; the palette's own card is the dialog, and an
  `sr-only` title names it. Escape clears a typed query first (cancelling Base UI's close), then
  closes.
- **Rows:** Create (New envelope, Draft with AI), Go to (the three sections), Settings (every page)
  always. Once something is typed: the workspace's folders, documents, envelopes, templates and
  drafts, then "Search All files for …" for anything older than the index. The palette keeps its
  query private, so `GlobalSearch` reads it from the input's `input` event; the rows are built by
  `searchEntries` (`lib/global-search.ts`, unit-tested).
- **Index:** `GET /api/search` returns the newest 100 of each kind (`SEARCH_INDEX_LIMIT`), titles
  plus what a search should match (an envelope's recipients' names and emails), loaded when the
  palette opens and reused for 30 seconds. Drafts only when the assistant is available to the
  caller. Tenant-scoped like every list, and classified in `tenant-isolation.itest.ts`.
- Arc's palette isn't virtualised and animates its rows, so the cap keeps the worst case at a few
  hundred rows.

## Consequences
- Search is substring matching on titles, statuses and recipients, in the browser. Full-text
  search over document contents would need a server query and a palette that accepts async
  results.
- The palette uses coss's dialog while other dialogs use Arc's: the one place the two meet.
