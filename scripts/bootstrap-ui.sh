#!/usr/bin/env bash
# One-time (re-runnable) install of the ONLY allowed UI sources into apps/web:
#   - coss ui   (@coss/style → all primitives, theme tokens, fonts)   https://coss.com/ui/docs
#   - Extend UI (@extend/*  → document components)                    https://ui.extend.ai/ui/docs
# Needs internet access to coss.com, www.extend.ai and ui.shadcn.com.
# When the CLI asks to overwrite existing primitives, answer NO (keep coss's).
set -euo pipefail

cd "$(dirname "$0")/../apps/web"
SHADCN="bunx shadcn@latest"

echo "▸ 1/4 coss ui (theme + all primitives)"
if [ ! -f components.json ]; then
  $SHADCN init @coss/style
else
  $SHADCN add @coss/style
fi

echo "▸ 2/4 registering the @extend registry in components.json"
bun -e '
  const f = "components.json"
  const c = JSON.parse(await Bun.file(f).text())
  c.registries = { ...(c.registries ?? {}), "@extend": "https://www.extend.ai/ui/r/styles/{style}/{name}.json" }
  // Extend must install its Base UI variants to match coss (ADR 0007).
  if (!String(c.style ?? "").startsWith("base-")) c.style = "base-nova"
  await Bun.write(f, JSON.stringify(c, null, 2) + "\n")
'

echo "▸ 3/4 Extend UI document components"
$SHADCN add \
  @extend/pdf-viewer \
  @extend/pdf-editor \
  @extend/e-signature \
  @extend/file-upload \
  @extend/file-thumbnail

echo "  Without --overwrite the CLI keeps existing coss primitives. If you overwrote, restore"
echo "  components/ui/* and lib/utils.ts, and re-apply the spacing patch (ADR 0007)."

echo "▸ 4/4 verifying"
cd ../..
bun install
bun run --filter @sahihi/web typecheck && echo "✓ web typechecks. UI bootstrap complete." \
  || echo "✗ typecheck failed. Check component names/props against components/ui (docs/ui.md)."
