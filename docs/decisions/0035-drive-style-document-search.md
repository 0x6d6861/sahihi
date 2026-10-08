# 0035: Drive-style search on the Documents page (local Arc patches)

- **Status:** accepted
- **Date:** 2026-10-08

## Context
The Documents page had a small outlined `SearchField` next to an "Add filter" menu. Applied
filters showed in a separate chip strip below. We wanted the search to work like Google Drive's: a
wide filled search bar, then one row of filter chips, each a menu that shows its value once set.
Arc offers neither part as is. `SearchField` is outlined and always shows a visible label.
`FilterMenu` and `FilterToolbar` follow the "add, then remove" model. `DropdownMenu` has no state
for a chip that holds a value, and its menu always aligns to the trigger's end.

## Decision
- **Layout** (`components/app/documents/documents-toolbar.tsx`, a `<search>` landmark placed
  directly under the page header and above the folders, because search finds folders and
  documents anywhere):
  1. `SearchField appearance="filled"`, up to `max-w-3xl`, placeholder "Search documents and
     folders". The label "Search documents" is hidden visually but still read by screen readers.
  2. One row of chips: **Status**, **People** (uploader), **Added** (period), **Tags** and
     **Color** (the last two only when the workspace uses them). Each chip is an Arc `DropdownMenu`
     that opens from its start edge. The first item clears the chip ("Any status", "Anyone",
     "Any time"…), then a separator, then the options. The chosen item shows a check, and every
     item keeps an icon slot so the labels line up. A set chip shows its value instead of its name
     and a check icon, and is filled with the accent tint. Its accessible name is "People: Heri
     Agape". "Clear filters" (Arc ghost button) appears once any chip is set. On narrow screens
     the row scrolls sideways; the page itself never does.
  3. The List / Grid `SegmentedControl` (ADR 0033) at the end of the chip row.
- **Patches**, marked `sahihi patch (ADR 0035)`:
  - `search-field`: `appearance="filled"`. A 48px pill on `--surface-muted` with no border; the
    label is visually hidden; on focus it moves to `--surface` with a border and `--shadow-raised`.
  - `dropdown-menu`: `active` (sets `data-active`: an accent-tint fill and accent text),
    `align` (`"start" | "end"`, default `"end"` as before) and `accessibleLabel` (`aria-label`
    on the text trigger).
- People names are unique in menus (a "(2)" suffix), because menu items are keyed by label
  (ADR 0023).

## Consequences
- Arc's `FilterMenu` and `FilterToolbar` are no longer used on the Documents page. They stay
  vendored for other screens.
- After reinstalling `@uiarc/search-field` or `@uiarc/dropdown-menu`, re-apply the patches (search
  the old files for the comment). ADR 0034's `iconOnly` patch is in the same `dropdown-menu` files.
- There are no type-ahead suggestions under the search bar (Drive lists matching files as you
  type). The list updates 300ms after typing stops instead. A suggestion list would need a search
  endpoint that returns a few names quickly.
