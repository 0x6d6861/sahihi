# 0034: Icon-only ⋮ menus for documents and folders (local Arc patch)

- **Status:** accepted
- **Date:** 2026-10-08

## Context
ADR 0023 makes every action menu an Arc `DropdownMenu` whose trigger is text with a chevron
("Actions ▾"). On the Documents grid (ADR 0033) the cards are about 13rem wide, and that button
took a third of the title row. File names were cut to a few letters. The grid now follows Google
Drive's file tiles: the title row holds the file-type icon, the name and a ⋮ button. Arc's
`DropdownMenu` has no icon-only trigger, and its trigger markup sits inside the vendored component.

## Decision
- Patch `components/arc/dropdown-menu/dropdown-menu.tsx` and `.module.css` (lines marked
  `sahihi patch (ADR 0034)`). The patch adds an `iconOnly` prop: the trigger becomes a round
  32px button (40px on coarse pointers) that shows only `icon` and uses `label` as its
  `aria-label` and `title`. The button is transparent at rest. Its hover and open fill is a
  foreground tint, so it shows on the muted card in both themes. Like the text trigger, it never
  scales on press (it anchors the menu).
- Use it **only for documents and folders on the Documents page**: `DocumentRowActions compact`
  in both the grid and the list (so the two layouts match), and `FolderCard`. The label names the
  item ("Actions for Lease.pdf"), so screen-reader users can tell one menu from the next. Other
  tables (envelopes, templates, members…), page headers and every other menu keep the text
  "Actions" trigger from ADR 0023.
- Both layouts mark documents with the same file-type icon (`DocumentTypeIcon`: red PDF mark,
  muted for a failed upload).

## Consequences
- After reinstalling `@uiarc/dropdown-menu`, re-apply the patch (search the old files for the comment).
- Remove the patch if Arc ships an icon-only trigger upstream.
