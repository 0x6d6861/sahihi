# 0023: Arc as the design system and primitive layer

- **Status:** accepted
- **Date:** 2026-10-07

## Context
The web app was built only from coss ui (Base UI), Extend (PDF UI) and shadcn as a fallback, with
coss's default theme. We wanted a calmer, more considered interface and a working dark mode. Arc
(uiarc.dev) is a React component library installed through the shadcn CLI that offers this
(CSS modules, semantic CSS variables, Motion). Adopting it raises four problems:

1. Golden rule 1 bans Radix, and many Arc primitives (dialog, drawer, select, checkbox, switch,
   popover, tooltip, tabs) are built on Radix.
2. Arc's `foundation.css` defines `--background`, `--foreground`, `--border`, `--accent` and the
   status colours on `:root`, the same names coss uses. coss uses `--accent` for hover fills, while
   in Arc it's the brand accent. Loading both broke coss hovers.
3. coss puts dark mode on the `.dark` class and Arc on `:root[data-theme="dark"]`, and the app had
   no way to switch themes.
4. With `components.json` set to `base-nova`, the shadcn CLI rewrites `asChild` to Base UI's
   `render` in everything it installs. That breaks Arc's Radix-based files.

## Decision
- **Arc is the primitive layer for app code.** Pages and `components/app/**` use Arc (`@uiarc/*`,
  installed into `components/arc/`) for every primitive Arc ships: button, input, textarea,
  password field, number field, select, combobox, checkbox, switch, radio group, dialog, drawer,
  popover, tooltip, tabs, alert, badge, empty state, skeleton, breadcrumb, pagination, avatar,
  progress, usage meter, metric card, OTP input, date picker, timeline, copy button, signature pad,
  search field, filter toolbar, dropdown menu, user menu and toast stack.
- **Radix is allowed only as a dependency of vendored Arc items.** App code never imports Radix.
  Versions are pinned exactly.
- **Sidebar.** (Superseded for the app shell by ADR 0026: a top bar.) Arc's sidebar blocks are Pro, so the shell keeps coss `Sidebar` for its mechanics
  (icon rail, sheet on phones, ⌘B, persisted state) and is styled to Arc's rules in
  `components/app/app-shell/`: flat on the page background with a hairline edge, no inset panel or
  shadow, accent only on the active item (one gliding indicator), settings in a "Workspace" group,
  the account menu in the footer, and no desktop top bar.
- **Every action menu is Arc's `DropdownMenu`.** Its trigger is always text with a chevron, so row
  menus read **Actions**. The org switcher's trigger shows the active workspace, which is marked with
  a check in the list; in the collapsed icon rail only the workspace mark shows. Items are one line
  and keyed by label, so a reason an item is unavailable goes into its label ("Send reminder
  (available again in 40 min)"), and duplicate workspace names get a suffix.
- **coss stays where Arc has no equivalent:** `Table`, `Sidebar`, `Separator`, `Kbd`, `Toggle` (the
  field palette), `ScrollArea`, `Spinner` (unknown-duration waits), icon-only `Button`s, `Select` where options need a colour swatch (recipient picker) or sit in a table cell
  with no visible label, block-shaped `Skeleton`s (Arc's skeleton draws text lines), and the
  checkbox drawn on a PDF field (it must stretch to the field's box). Extend keeps document UI.
- **Two thin compositions** stand in for missing Arc items. `components/app/button-link.tsx` puts
  Arc's button styles on `next/link`, because Arc's Button has no link variant. This is the only
  place that imports an Arc stylesheet. `components/app/panel.tsx` is a titled, bordered section:
  Arc's `Card` is a content card (media, byline, quick look), not a form or settings container.
  `components/app/confirm-dialog.tsx` composes Arc's Dialog and Buttons for confirmations.
- **Token bridge.** Load order is `globals.css` (coss) → `components/arc/foundation.css` →
  `app/app.css`. `app.css` maps coss's tokens onto Arc's roles for both themes. One line in
  `globals.css` points Tailwind's `accent` colour at `--ui-hover` instead of `--accent`. That's a
  reinstall patch, marked `sahihi patch (ADR 0023)`, so re-apply it after `ui:bootstrap`. Field
  overlays on the PDF page use the `.on-paper` scope, which pins the light values, because the paper
  stays white in both themes.
- **Dark mode** follows the system by default. The account menu (Arc `user-menu`) offers Light, Dark
  and System, stored in the `sahihi-theme` cookie (`lib/theme.ts`). For an explicit choice the server
  renders `.dark` and `data-theme` on `<html>`. For System, a small inline script with the CSP nonce
  applies `prefers-color-scheme` before first paint.
- **Installing Arc:** run the shadcn CLI with `components.json` temporarily set to a Radix style
  (`new-york`) so it skips the `asChild` → `render` transform, then restore `base-nova` (see
  `.claude/commands/add-ui.md`). Arc's files are vendored like `components/ui/`: don't edit them, and
  Biome ignores them.

## Consequences
- One look across coss, Extend and Arc in both themes, from a single set of tokens.
- Arc's CSS modules aren't in a cascade layer, so they win over Tailwind utilities when both set the
  same property (`display`, `font`, `max-width`…). Wrap an Arc component to hide or position it
  (`<span className="lg:hidden">`), and use an inline `style` with a token for the rare override,
  such as `fontFamily: var(--font-mono)` or a wider dialog.
- Arc is a second component API: Radix `asChild` on Arc triggers, Base UI `render` on coss parts.
  Read the installed file before using either.
- Toasts go through `toastManager` in `components/app/toast.tsx`, which forwards to Arc's toast
  stack. Foreground actions confirm in place (the button's loading state and label, or the dialog's
  next view). Toasts are for background results and errors.
- Unused coss files stay vendored (the `@coss/style` install brings them back anyway). App code must
  use the Arc equivalent.
