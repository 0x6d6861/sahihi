# 0007: Reconciling coss and Extend after the UI bootstrap

- **Status:** accepted
- **Date:** 2026-09-26

## Context
The first `bun run ui:bootstrap` left `components.json` on the `new-york` style, so the Extend CLI
installed its **Radix** variants (`asChild`, `delayDuration`, `SelectContent position`) on top of coss's
Base UI primitives. It also pulled in `radix-ui`, `@radix-ui/react-popover`, a Radix `dropdown-menu`,
and rewrote `lib/utils.ts`. `@sahihi/web` had 62 type errors.

After switching to `base-nova` and reinstalling Extend, two mismatches remained, both in vendored code:
- Extend's code isn't written for `noUncheckedIndexedAccess` (about 37 errors across `pdf-editor*`
  and `pdf-viewer`).
- `pdf-editor-properties.tsx` passes `spacing={0}` to `ToggleGroup`. shadcn's base-nova ToggleGroup
  has that prop, but coss's doesn't.

## Decision
- `components.json` uses `"style": "base-nova"`. `scripts/bootstrap-ui.sh` sets it before installing
  Extend, so reruns get the Base UI variants.
- Where registries overlap in `components/ui/`, **coss wins**. After any Extend install that touches
  `components/ui/*` (or `lib/utils.ts`), restore the coss versions. The CLI adds shadcn base-nova
  `dropdown-menu` and `resizable`, which coss doesn't ship. We keep them (they're Base UI and
  `react-resizable-panels`) and their `cn` package import.
- `apps/web/tsconfig.json` sets `noUncheckedIndexedAccess: false`. tsc can't scope compiler options
  per folder, and patching vendored files would be undone on every reinstall.
- **Local patch:** the two `spacing={0}` props are removed from
  `components/extend/pdf-editor-properties.tsx`. Re-apply this after reinstalling `@extend/pdf-editor`.
  The only visible effect is coss's default `gap-0.5` between the bold/italic and alignment toggles.
- Biome ignores the rest of the vendored output (`components/blocks`, and in `lib/`/`hooks/` the
  registry helpers `color-picker-utils`, `pdf-thumbnail-utils`, `segmented-control` and
  `use-media-query`) and has Tailwind CSS directives enabled for `globals.css`.
- Radix packages are removed, and web dependencies are pinned to exact versions.

## Consequences
- Web code loses index-access strictness. In `lib/` and `components/app/`, guard array and record
  lookups explicitly anyway, and keep pure helpers in `@sahihi/core`, which is still strict.
- Reinstalling Extend means: run the CLI, restore coss files in `components/ui/` and `lib/utils.ts`,
  re-apply the `spacing` patch, then run `bun run typecheck`.
