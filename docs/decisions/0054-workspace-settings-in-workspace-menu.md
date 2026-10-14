# 0054: Workspace settings in the workspace menu

- **Status:** accepted
- **Date:** 2026-10-14

## Context
ADR 0026 made the avatar menu the only way into Settings. Six of the nine settings pages belong to
the workspace (Workspace, Members, Plan & usage, Data, Storage, API), not to the person. Someone
looking to invite a teammate or change the plan opens the menu with the workspace's name on it,
which only switched workspaces.

## Decision
- The workspace menu (top bar, left) lists the workspaces, then **Workspace settings**, **Members**
  and **Plan & usage** (the three most sought), then "New workspace". They open the existing
  settings pages; Data, Storage and API stay one tab away.
- The avatar menu keeps "Settings", which opens Profile.
- No Settings item in the centre nav pill: it holds the daily places (All files, Drafting, Inbox).
- This replaces ADR 0026's "Settings is reachable only from this menu".

## Consequences
- Two ways into the same pages; the settings tabs stay the one place that lists them all.
- The links show for every member, as the pages do; each page already limits what a member can
  change.
