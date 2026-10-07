# 0027: User menu radii on Arc's shared tokens (local patch)

- **Status:** accepted
- **Date:** 2026-10-07

## Context
Arc's `user-menu` hard-codes its corners: the panel `--menu-radius: 10px`, rows and the hover
highlight `6px`, the theme switch `7px` / `5px`. Every other Arc floating surface uses the shared
tokens: `dropdown-menu` and `popover` panels are `var(--radius-panel)` (1.625rem) with rows at
`--radius-panel` minus the panel's padding. In the top bar (ADR 0026) the workspace switcher's menu
and the account menu open side by side, so the mismatch shows. The radius is declared on the panel
element itself in an unlayered CSS module, so the app can't override it without a selector hack
against hashed class names; AGENTS.md rule 2 allows a vendored change with an ADR.

## Decision
Patch `components/arc/user-menu/user-menu.module.css` (radii only, nothing else):

- `.panel`: `--menu-radius: var(--radius-panel)` (also used by the mobile sheet's rows).
- `.highlight`, `.item`: `calc(var(--menu-radius) - var(--inset))`, concentric with the panel, as
  `dropdown-menu` does with its padding.
- `.segments`, `.thumb`, `.segment` (theme switch): `var(--radius-pill)`, like Arc's segmented
  controls.

A comment at the top of the file lists the patched rules (`sahihi patch (ADR 0027)`).

## Consequences
- After reinstalling `@uiarc/user-menu`, re-apply the patch (search the old file for the comment).
- If Arc moves the user menu onto its radius tokens upstream, drop the patch.
