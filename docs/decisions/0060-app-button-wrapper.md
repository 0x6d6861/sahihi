# 0060: App Button and Badge wrappers for the emerald theme

- **Status:** accepted
- **Date:** 2026-10-15

## Context
ADR 0058 makes emerald the primary colour. Arc's Button and SplitButton paint their primary variant
from `--foreground` (fill) and `--background` (text), so they stay black / white whatever the theme
colour is. Editing Arc's CSS would be a second vendored patch on the most-used component.

## Decision
- `components/app/button.tsx` re-exports Arc's `Button` (same props and types) and adds the class
  `app-primary` when `variant` is `primary`. `components/app/split-button.tsx` does the same on a
  `display: contents` wrapper, since Arc's SplitButton takes no class. `ButtonLink` adds it too.
- `app-primary` (in `app/app.css`) sets `--foreground: var(--primary)` and
  `--background: var(--primary-foreground)` on that element only. Text and icons inside the button
  inherit the remapped pair; nothing outside it changes.
- App code imports `Button` / `SplitButton` from `@/components/app/…`. Biome's
  `noRestrictedImports` (`biome.json` overrides) fails the lint on a direct import of Arc's button
  or split button anywhere in `apps/web` except the wrappers.
- **Badge:** Arc paints the `info` badge tone from the accent, which is now emerald, so "in progress"
  read as "completed". `components/app/badge.tsx` adds `app-info` to info badges, which points
  `--accent`, `--accent-strong` and `--accent-subtle` at `--info` on that badge only. Same import
  rule (`@/components/app/badge`).

## Consequences
- Arc's Button file stays as shipped; a reinstall needs no patch.
- Secondary, ghost and danger buttons are unchanged.
- Arc blocks that render their own primary Button internally (inside `components/arc/`) stay
  black / white. None of the app's screens use one today; check new blocks when installing them.
