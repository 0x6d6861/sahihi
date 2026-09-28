---
description: Implement the next unchecked roadmap item end to end
argument-hint: "[optional roadmap item text to target]"
---
1. Read `AGENTS.md` and `docs/roadmap.md`. Target: $ARGUMENTS. If that's empty, take the first
   unchecked `[ ]` or partial `[~]` item.
2. Read every doc the item touches (see the Doc map in AGENTS.md) and grep for `TODO(roadmap` markers
   in the relevant area.
3. State a 3–6 bullet plan, then implement it following existing patterns. UI uses only coss/Extend
   defaults (docs/ui.md), and API changes follow the security checklist (docs/security.md).
4. Add or extend tests for any pure logic.
5. Run `bun test && bun run typecheck && bun run lint` and fix failures.
6. Tick the roadmap item and update the docs if behaviour changed. Summarise what changed and any
   follow-ups.
