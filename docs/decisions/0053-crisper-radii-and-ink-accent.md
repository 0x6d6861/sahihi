# 0053: Crisper radii and an ink-blue accent

- **Status:** accepted
- **Date:** 2026-10-14

## Context
ADR 0023 adopted Arc's tokens as they ship. In use, three of them worked against a product that
holds legal signatures:

- **Radii.** Arc's `--radius-control` is 18px, so a 44px button or field is neither a rectangle nor a
  pill, and a 36px button *is* a pill: one toolbar mixed both shapes. Tailwind's scale derives from
  the same token, so `Panel` (`rounded-2xl`) came out at about 32px around square-edged tables. The
  result read soft and consumer-like.
- **No hue.** With no `data-accent`, Arc's accent is grey, so focus, selection, active tabs, progress
  and info badges were all grey. Only status colours carried any colour.
- **Flat dark mode.** Arc's dark ramp has zero chroma, and panels (21.5%) barely separated from the
  page (19%) with a 29% border.

## Decision
- Override the radius tokens in `app/app.css` (no vendored file changes): `--radius-control` 10px,
  `--radius-panel` 16px, `--radius-surface` 20px. Three shapes: **pill** (chips, nav pill, avatars,
  switches), **control** (buttons, fields, menus, tabs), **panel** (sections, dialogs, cards).
  Tailwind's `rounded-lg` = 10px, `rounded-xl` = 14px, `rounded-2xl` = 18px.
- Set `data-accent="blue"` on `<html>` (Arc's own blue). It shows up as ink: focus outlines,
  selected rows, active tabs, info badges, progress and filled OTP cells. Primary buttons stay
  black / white, and the app's `--info` token was already this blue, so "unread" and the accent agree.
- Tint Arc's dark surfaces and borders toward the accent hue (chroma 0.006, hue 260) at the same
  lightness, and raise the dark `--border` from 29% to 31%.

## Consequences
- Contrast pairs in `docs/ui.md` are unchanged (same lightness; the border is decorative).
- Arc components read these tokens, so a reinstall keeps the new look. A component with a
  hard-coded radius won't follow; check new Arc items.
- The marketing site's coded screens (`apps/website/src/components/demos/`) still draw the softer
  radii and need re-matching against fresh showcase captures.
