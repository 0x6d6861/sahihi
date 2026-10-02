# CLAUDE.md

@AGENTS.md

## Claude Code specifics

- Slash commands live in `.claude/commands/`:
  - `/next-task`: pick up the next unchecked roadmap item and implement it end to end
  - `/check`: run the full verification suite and fix what fails
  - `/add-ui <name>`: install a coss, Extend or (fallback) shadcn component the approved way
  - `/new-endpoint <description>`: add an API route following the house patterns
  - `/add-job <description>`: add a BullMQ job (producer + worker + tests)
  - `/adr <title>`: record an architecture decision
- Prefer reading the relevant `docs/*.md` over exploring the codebase blindly. The docs are kept in
  sync with the code.
- Never run `prisma migrate reset` or `docker compose down -v` without asking. Both wipe local data.
