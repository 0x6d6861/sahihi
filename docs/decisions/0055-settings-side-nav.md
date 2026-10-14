# 0055: Settings side nav on wide screens

- **Status:** accepted
- **Date:** 2026-10-14

## Context
Settings had nine pages in one horizontal Arc `Tabs` bar. At that count the bar runs nearly the
width of the page, mixes your account (Profile, Security, Notifications) with the workspace's pages
without showing the split, and leaves the widest pages with tabs that look unevenly spaced.

Arc has no vertical tabs or nav list; its settings blocks (`settings-page`, `settings-command`) and
sidebars are Pro. coss's `Sidebar` is an app-shell sidebar (provider, collapse, rail), far more than
a list of nine links.

## Decision
- From `lg`, settings is a two-column layout: a sticky side nav (`SettingsNav`,
  `components/app/settings/settings-nav.tsx`) and the page. The nav groups the pages under
  **Account** and **Workspace**; the workspace's own page is "General" there (`navLabel` in
  `SETTINGS_NAV`), since it sits under the Workspace heading.
- `SettingsNav` composes Next links with theme tokens (as `PillNav` does): `h-9`, `rounded-lg`,
  the current page on `bg-muted` with `aria-current="page"`, hover only where hover is real, the
  keyboard focus ring. No motion: people switch settings pages often enough that a gliding
  indicator would only slow them.
- Below `lg`, the Arc `Tabs` bar stays as before, labels unchanged.

## Consequences
- The settings pages and their order still live in one list (`SETTINGS_NAV` in `lib/nav.ts`).
- A hand-composed nav list: if Arc ships a free vertical nav, switch to it.
