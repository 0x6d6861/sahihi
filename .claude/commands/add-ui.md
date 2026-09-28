---
description: Install a coss or Extend UI component the approved way
argument-hint: "<component-name, e.g. otp-field or @extend/pdf-editor>"
---
Component: $ARGUMENTS

1. Decide the source: document/PDF/file components → `@extend/<name>`; everything else →
   `@coss/<name>`. Confirm it exists at https://coss.com/ui/docs or https://ui.extend.ai/ui/docs.
2. `cd apps/web && bunx shadcn@latest add @coss/<name>` (or `@extend/<name>`). If asked to overwrite
   existing primitives, answer **no**.
3. Don't edit the installed files. Open them to learn the real export names and props, then use
   them from `components/app/` or the page.
4. `bun run --filter @sahihi/web typecheck`. Update the screen map in `docs/ui.md` if relevant.
If the registry is unreachable (no internet), stop and tell the user. Never hand-write a substitute.
