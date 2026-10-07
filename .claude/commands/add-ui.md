---
description: Install an Arc, coss, Extend or (fallback) shadcn UI component the approved way
argument-hint: "<component-name, e.g. @uiarc/segmented-control, @extend/pdf-editor or a coss item>"
---
Component: $ARGUMENTS

1. Decide the source, in this order (ADR 0023):
   - any primitive Arc ships → `@uiarc/<id>` (catalog: `https://uiarc.dev/llms.txt`, docs:
     `https://uiarc.dev/components/<id>/markdown`; the `arc` skill has the rules). Free items only
     unless the user has Arc Pro.
   - document/PDF/file components → `@extend/<name>` (https://ui.extend.ai/ui/docs)
   - what Arc doesn't have → `@coss/<name>` (https://coss.com/ui/docs)
   - **fallback**, only when none of these has it → shadcn `<name>` (no prefix).
2. Install:
   - **Arc:** the CLI's `base-nova` transform rewrites Radix `asChild` to `render` and breaks Arc. Swap
     the style for the install, then restore it:
     ```bash
     cd apps/web && cp components.json /tmp/components.json \
       && sed -i '' 's/"style": "base-nova"/"style": "new-york"/' components.json \
       && bunx --bun shadcn@latest add @uiarc/<id> --yes; cp /tmp/components.json components.json
     ```
     Then pin any new dependency in `apps/web/package.json` to the exact installed version.
   - **coss / Extend / shadcn:** `cd apps/web && bunx shadcn@latest add @coss/<name>` (or
     `@extend/<name>`, or plain `<name>`). If asked to overwrite existing files, answer **no**.
3. Don't edit the installed files. Open them to learn the real export names and props (Arc takes
   props like `label`, `error`, `tone`; coss uses Base UI parts), then use them from `components/app/`
   or the page.
4. `bun run --filter @sahihi/web typecheck`. Update the screen map in `docs/ui.md` if relevant, and
   check the screen in light and dark.
If the registry is unreachable (no internet), stop and tell the user. Never hand-write a substitute.
