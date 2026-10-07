# 0025: Color and tags on folders and documents

- **Status:** accepted (amended 2026-10-07: free hex colours, see below)
- **Date:** 2026-10-07

## Context
Folders (ADR 0022) group documents in one place each. Senders also want cross-cutting labels
("Urgent", "Client A", "Q3") and a quick visual cue, and to find things by them. A document can
only live in one folder; a label can sit on documents in many.

## Decision
- **Color:** an optional `ItemColor` on `Folder` and `Document`, a Prisma enum of nine fixed names
  (`ITEM_COLORS` in core, kept in sync by `enums.test.ts`). The web maps each to a theme token
  (`--label-red` … in `app/app.css`, light and dark values, 3:1 against the page) and shows it only as
  a dot (before a document's name; at the start of a folder's tag line), with an sr-only colour name. No hex in components, no free colour input.
  Label colours never mean status.
- **Tags:** a workspace `Tag` model (`organizationId`, display `name`, lowercased `key`, unique per
  workspace) with implicit many-to-many relations to `Document` and `Folder`. Tags are created on
  first use (`createMany … skipDuplicates`, then read back), so "NDA" and "nda" are one tag and the
  first spelling stays. A request always sends the **full** list (`tags: { set }`), at most 10 tags
  of 40 characters, normalized and de-duplicated by `TagListSchema`.
- **Search:** `q` matches a document's or folder's name **or** any of its tags (substring on the
  key); `tag` (exact, case-insensitive) and `color` are filters. All three search **every** folder,
  like `q` did in ADR 0022, and `GET /folders` answers them with matching folders from anywhere,
  each with its parent's path. Status, sender and period still narrow either view.
- **Permissions:** labelling a document follows the move rule (uploader, or `document:manage-any`);
  labelling a folder follows the manage rule. Anyone allowed to label may create a tag.
- **UI:** one "Edit…" action in the folder and document menus replaces Rename: a dialog with the
  name (Arc `Input`), coss `ToggleGroup` color swatches and a coss `Combobox` with tag chips (Arc
  has neither a swatch picker nor a multi-select). It sends the name only when it changed. "Create folder" (button and ghost card) opens the same dialog
  empty, so a folder gets its color and tags as it is made (`POST /folders` already took them).
- **Document rename:** `PATCH /documents/:id { name }`, allowed while no sent envelope uses the
  document; after that it's a 409 (`permissions.rename` is false and the field is disabled with
  the reason), because signers see the name and the certificate prints it. Drafts don't freeze it.
  The tag popup portals into the dialog so the Radix modal keeps focus and pointer events. Tag and
  Color join the `FilterMenu`; the search placeholder is "Name or tag".

## Consequences
- Tags no longer on anything stay in the table; the Tag filter and suggestions only offer tags in
  use. A sweep or a "Manage tags" screen (rename, merge, delete) can come later.
- Tags and colours are organisation only, like folders: no envelope, template, certificate or
  signing code reads them, and they aren't in the workspace export yet.
- The join tables carry no `organizationId`; the API only connects tags read through
  `forOrganization(…).tag()`, and the integration tests check that tags never cross workspaces.
- Folder search filters the folder tree in memory (it's already loaded for paths), which is fine
  for hundreds of folders (same limit as ADR 0022).

## Amendment (2026-10-07): free colours with Arc's ColorPicker
The fixed nine-colour palette was replaced by any colour, picked with Arc's `ColorPicker`
(installed with `/add-ui`; Arc's docs suggest it for exact colours, not a fixed palette, which is
the trade-off accepted here).
- `color` is a nullable `TEXT` holding uppercase `#RRGGBB` (or `#RRGGBBAA` below full opacity),
  validated and normalized by `LabelColorSchema` / `normalizeLabelColor`. The `ItemColor` enum is
  gone; migration `label_colors_hex` maps the old names to the same hues as hex.
- The old palette lives on as `LABEL_COLOR_PRESETS` (named, so `labelColorName()` can announce
  "Blue"; any other colour is announced by its hex). They seed the picker's saved swatches.
- The `--label-*` theme tokens are removed. A label colour is **user data**, not a design token, so
  it may be rendered from hex, but only through `ColorDot` (inline background, hairline ring so
  light colours stay visible). It has no dark-mode variant: the dot shows the colour as picked.
- The Color filter lists the colours in use (`colors` from `GET /documents`, presets first) instead
  of the fixed nine; `color` in the URL is the hex without `#`.
- Escape in the open picker would also close the Radix dialog, so `EditItemDialog` ignores it
  while focus is inside the picker. The picker's panel opens inline under its swatch, inside the
  dialog.

## Amendment (2026-10-07): Arc TagInput, popovers in dialogs
- Tags use Arc's `TagInput` (Enter or comma adds, Backspace removes) instead of the coss
  `Combobox`. It has no suggestions, so the workspace's other tags show under it as "+ tag"
  buttons (`TagField`, at most eight). Typed tags are normalized with `uniqueTags` on every change.
- Arc's dialog clips Arc's inline popovers (checked in a browser: the colour panel ended 180px
  below the dialog's visible edge, and the Review & send expiry calendar ran off the window).
  `DIALOG_WITH_POPOVERS` lets the dialog overflow and sit near the top on windows at least `sm`
  wide and 46rem tall; `RevealPopovers` scrolls an opening popover into view where the dialog
  still scrolls. Applied to the edit/create dialog, "Move to…" (Arc `Combobox`) and Review & send,
  where the expiry field moved under the title so the calendar has room. Verified at 1280×800,
  1280×720 and 390×844: no popover cut off. No vendored file changed.
- The colour picker seeds seven preset swatches (all its row fits); teal and gray remain valid
  colours.
