# 0026: Top bar instead of a sidebar for the app shell

- **Status:** accepted (amends the shell part of ADR 0023)
- **Date:** 2026-10-07

## Context
The app has three sections (Documents, Envelopes, Templates) plus Settings. A full sidebar for
four links took a column of width from every page, and the draft editor (ADR 0021) adds its own
step rail, so the editor showed two rails side by side.

## Decision
- `components/app/app-shell/app-shell.tsx` is one top bar, no coss `Sidebar`:
  - **Left:** the Sahihi mark (links to Documents), a hairline, the workspace switcher (Arc
    `DropdownMenu`, unchanged).
  - **Centre:** the primary navigation as a segmented pill on `bg-muted`; the active item is a
    raised `bg-background` pill that glides between items (Motion `layoutId`, instant with reduced
    motion). Below `md` the pill takes its own row under the bar and stretches; below `sm` the
    items drop their icons.
  - **Right:** the Arc `UserMenu` as an avatar. **Settings is reachable only from this menu** (the
    sidebar's "Workspace › Settings" group is gone).
- Full-bleed pages (`isFullBleed`, the draft editor) fill the height under the bar. The draft
  editor now owns the page's only coss `SidebarProvider`, for its static step rail.

## Consequences
- No ⌘B / collapsible rail and no `sidebar_state` cookie in the app shell any more.
- A fourth or fifth section still fits the pill; beyond that, revisit (a "More" menu or a rail).
