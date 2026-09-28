---
description: Add an API endpoint following house patterns
argument-hint: "<what the endpoint does>"
---
Endpoint: $ARGUMENTS

Follow `docs/architecture.md` (request lifecycle) and the checklist at the end of `docs/security.md`:
- zod schema in `packages/core/src/schemas.ts` (shared with web), parsed via `parseJson`
- sender routes go in the existing router behind `requireOrg`, using `forOrganization`; public routes
  use `rateLimit` + `withSigner`
- state changes via `assertTransition` + `appendAuditEvent` inside `prisma.$transaction`; new
  audit types go in `AUDIT_EVENT_TYPES`
- enqueue jobs after commit
- update the API table in `docs/architecture.md`, add tests, and run `/check`
