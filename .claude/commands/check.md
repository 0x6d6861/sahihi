---
description: Run all checks and fix what fails
---
Run, in order: `bun test`, `bun run typecheck`, `bun run lint`. For each failure, find the root cause
and fix it. Don't weaken types, skip tests or add `biome-ignore` unless the reason is documented
inline. Also verify that every `docs/*.md` path referenced in code comments exists. Report the final
status.
