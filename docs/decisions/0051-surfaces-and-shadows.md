# 0051: A canvas for depth in light mode, and Arc's shadow levels

- **Status:** accepted (amends the theme bridge of ADR 0023)
- **Date:** 2026-10-13

## Context
In Arc's light theme `--background`, `--surface` and `--surface-raised` are all white, so every
screen was white on white and panels were told apart only by a hairline. Dark mode was layered
already (19 / 21.5 / 24 % lightness). Arc ships three shadow levels (`--shadow-resting`, `-raised`,
`-floating`) that the app never used; the few shadows were Tailwind's `shadow-sm` / `shadow-lg`,
which nearly vanish in dark mode. Notification dots took each notification's tone, so green meant
both "complete" and "unread" while the Inbox count was blue.

## Decision
- **`--canvas`** (`app.css`): `oklch(98.4% 0 0)` in light mode, `--background` in dark. The app
  shell paints its page area with it (`.app-canvas`); panels, tables and folder cards stay white.
  `--background` itself stays white, because coss fields and selects, the top bar, the public pages
  and Arc's primary button text are painted with it.
- **`--surface-muted` one step darker in light mode** (`--neutral-3`), so grey fills (search, file
  cards, tiles, segmented tracks) still read on the canvas. `muted-foreground` stays at 6.3:1 on it.
  `--border-strong` goes from 64 % to 62 % so field edges keep 3:1 on the darker grey.
- **Shadows only from Arc's levels** (`shadow-(--shadow-…)`): resting for the active pill, raised
  for the top bar once scrolled, the waiting question card and card hover (real hover only),
  floating for the selection bar and drag layers. Panels keep no shadow.
- **One unread colour:** the unread dot is info blue, like the Inbox count.

## Consequences
- New grey fills and shadows follow docs/ui.md → Surfaces and shadows.
- The paper (`.on-paper`) keeps its own values, so field overlays on PDFs are unchanged.
- Public pages (signing, verify, auth) get the slightly darker grey fills but no canvas.
