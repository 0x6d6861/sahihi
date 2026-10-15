# 0063: shadcn text fields until Arc ships a filled input

- **Status:** accepted (temporary)
- **Date:** 2026-10-15

## Context
The redesign's fields follow shadcn (32px, 8px radius, `input` border, ring on focus). Arc's
`Input`, `Textarea` and `PasswordField` draw their own outlined pill-ish field from CSS modules that
the app can't restyle without patching Arc. A fix is expected from Arc.

## Decision
- Install shadcn's default `input`, `textarea` and `label` (`base-nova`) into
  `apps/web/components/shadcn/` with `shadcn add … --path components/shadcn`, so the coss files in
  `components/ui/` are never overwritten. The CLI writes `import { cn } from "cn"` with `--path`;
  point it at `@/lib/utils` after a reinstall. Otherwise the files are as shipped (Biome ignores
  the folder like the other vendored ones).
- `components/app/fields.tsx` exports `Input`, `Textarea` and `PasswordField` with Arc's props
  (`label`, `description`, `error`), built on those parts plus a coss icon button for the password
  toggle. Every call site imports from there; Biome refuses the Arc and shadcn paths elsewhere.
- Other Arc controls (Select, SearchField, OtpInput, NumberField, Checkbox, Switch) stay Arc.

## Consequences
- When Arc ships the patch, switching back is changing `fields.tsx` to re-export Arc's components
  and deleting `components/shadcn/`.
- Field edges keep the app's `--input` token (3:1 contrast, ADR 0058); the 44px phone heights of
  Arc controls don't apply to these fields (32px everywhere).
