#!/usr/bin/env bash
# Stop api, worker and web (infra containers keep running; `bun run infra:down` stops them).
cd "$(git rev-parse --show-toplevel)"
for name in api worker web; do
  if [ -f ".run/$name.pid" ]; then
    kill -- "-$(cat ".run/$name.pid")" 2>/dev/null || true
    rm -f ".run/$name.pid"
  fi
done
# Anything else still holding the ports (e.g. started by hand). lsof sees nothing in this sandbox.
fuser -k 3000/tcp 4000/tcp >/dev/null 2>&1 || true
# `next dev` rewrites these on start; keep them out of your diff.
git checkout -- apps/web/AGENTS.md apps/website/AGENTS.md 2>/dev/null || true
echo stopped
