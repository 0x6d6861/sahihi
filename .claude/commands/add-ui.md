---
description: Install a coss, Extend or (fallback) shadcn UI component the approved way
argument-hint: "<component-name, e.g. otp-field, @extend/pdf-editor or a shadcn item>"
---
Component: $ARGUMENTS

1. Decide the source, in this order:
   - document/PDF/file components → `@extend/<name>` (https://ui.extend.ai/ui/docs)
   - everything else → `@coss/<name>` (https://coss.com/ui/docs)
   - **fallback**, only when neither coss nor Extend has it → shadcn `<name>` (no prefix,
     https://ui.shadcn.com/docs). Check `components/ui/` first: Extend may already have vendored it.
2. `cd apps/web && bunx shadcn@latest add @coss/<name>` (or `@extend/<name>`, or plain `<name>` for
   shadcn). If asked to overwrite existing files, answer **no**: a shadcn item must never replace a
   coss or Extend file. If a shadcn item's name clashes with a coss one, stop and tell the user.
3. Don't edit the installed files. Open them to learn the real export names and props (coss and
   shadcn differ, e.g. `MenuPopup` vs `DropdownMenuContent`), then use them from `components/app/`
   or the page.
4. `bun run --filter @sahihi/web typecheck`. Update the screen map in `docs/ui.md` if relevant.
If the registry is unreachable (no internet), stop and tell the user. Never hand-write a substitute.
