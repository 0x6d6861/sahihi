# 0058: Taupe and emerald theme, small radius, compact controls

- **Status:** accepted
- **Date:** 2026-10-15

## Context
The redesign (`design/app/app.pen`) moves the app to a shadcn-style theme: Tailwind's **taupe** scale
as the neutral base and **emerald** as the theme colour, shadcn's "small" radius (0.45rem) and the
compact sizing of its "Rhea" style (32px controls). ADR 0053 had chosen an ink primary, a blue accent,
10/16/20px radii and 44px controls. Arc's foundation.css and the coss globals are vendored, so the
change has to live in the app's own token bridge.

## Decision
- **Where:** everything in `apps/web/app/app.css`, which loads after `components/arc/foundation.css`.
  No vendored file changes for this ADR.
- **Neutrals:** Arc's `--neutral-0…11` ramp is redefined with taupe values (0 stays white), and the
  role tokens (`--foreground`, `--text-secondary`, `--text-muted`, `--border*`, `--canvas`,
  `--surface-muted`) point at it. Dark mode uses taupe-950 / taupe-900 surfaces instead of the
  hue-260 tint from ADR 0053.
- **Theme colour:** `<html data-accent="emerald">`, a preset name Arc doesn't define, so a reinstall of
  foundation.css can't win over it. Light: accent emerald-600, accent text emerald-800, primary fill
  emerald-700 with white text (5.4:1). Dark: accent emerald-400, primary emerald-500 with emerald-950
  text (6.1:1). The coss `--primary` follows the primary fill. Arc's own primary Button reads
  `--foreground`/`--background`, which ADR 0060 handles.
- **Status colours** stay as they were. **Info stays blue** so "in progress" and "unread" never read
  as success green.
- **Radius:** `--radius: 0.45rem`, so Tailwind's scale is lg 7px, xl 10px (menu rows), 2xl 13px,
  3xl 16px (popovers). Arc: `--radius-control` 13px (buttons, fields, tabs, alerts),
  `--radius-panel` / `--radius-surface` 19px (cards, sections, dialogs). Supersedes ADR 0053's radii.
- **Heights:** `--control-height-sm/md/lg` 28 / 32 / 36px; on screens up to 640px they go back to
  36 / 44 / 50px for touch.
- **Paper:** `.on-paper` pins Arc's original pure-grey light values and the light emerald accent, so a
  PDF page stays neutral white with field overlays at light-mode contrast in both themes.

## Consequences
- One file owns the look; Arc and coss can be reinstalled without losing it.
- Contrast is re-measured in `docs/ui.md` → Colour contrast; every pair still clears AA.
- Arc parts with hard-coded sizes (menu rows 36px, command palette rows 34px, drawer radii) don't
  follow the tokens; ADR 0059 patches the menus.
- The marketing site's coded screens copy the app palette (`--dm-*`) and must be updated to match.
- Supersedes the radius and accent parts of ADR 0053; its border-contrast rule stands.
