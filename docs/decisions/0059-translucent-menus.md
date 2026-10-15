# 0059: Translucent menus (Arc patch)

- **Status:** accepted
- **Date:** 2026-10-15

## Context
The redesign uses shadcn's "Default / Translucent" menu colour: menus float as a 70% surface with a
strong backdrop blur, 32px rows and soft highlights. Arc's menus are opaque `--surface-raised` panels
with 34–36px rows, and those values are written inside each component's CSS module, where no token
or app stylesheet can reach them (module classes are hashed, and app.css can't out-rank them without
`!important`). ADR 0023 forbids editing vendored files without an ADR.

## Decision
Append one block, marked `sahihi patch (ADR 0059)`, to the end of five Arc stylesheets:
`dropdown-menu`, `select`, `popover`, `user-menu` and `command-palette` (`*.module.css` under
`apps/web/components/arc/`). Each block:

- paints the panel `color-mix(in oklab, var(--surface-raised) 70%, transparent)` (the palette uses
  its own surface) with `backdrop-filter: blur(40px) saturate(1.5)`, and `--radius-popover` (16px);
- sets rows to 32px with `--radius-xl` (10px), highlights to `foreground` at 10%, separators to
  `foreground` at 5%;
- repeats the `prefers-reduced-transparency: reduce` fallback (opaque surface, no blur) after it, so
  that preference still wins.

The block is appended, never interleaved, so a reinstall is: install, then paste the block back.
Write `-webkit-backdrop-filter` **before** `backdrop-filter`: Turbopack's Lightning CSS keeps only
the last of the pair, and Chrome ignores the prefixed one.

## Consequences
- Menus match the design in both themes; dark mode reads through the blur on emerald and status
  colours, so text contrast still comes from the 70% surface, not the page behind it.
- Five vendored files carry a patch; `docs/ui.md` lists them with the others to re-apply.
- Coss menus (`components/ui/menu.tsx`) are untouched; the app uses Arc menus everywhere today.
