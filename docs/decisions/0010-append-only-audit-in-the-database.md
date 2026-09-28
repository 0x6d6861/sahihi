# 0010: Append-only audit trail enforced by the database

- **Status:** accepted
- **Date:** 2026-09-28

## Context
The audit trail is evidence. The hash chain already makes edits *detectable*
(`verifyAuditChain`, and the chain head printed on the certificate). But any code path, script or
compromised credential with the app's database login could still rewrite or delete rows. Rule 7
("never update or delete AuditEvent rows") was only a convention.

`AuditEvent.recipientId` was `ON DELETE SET NULL`, so deleting a recipient silently *updated*
evidence rows. Organization deletion (better-auth, owner only) cascades through envelopes to their
audit events.

## Decision
- A group role `sahihi_app` (created by a migration, `NOLOGIN`). Each environment adds a login role
  `IN ROLE sahihi_app` for the api and worker. It has DML on all tables, minus UPDATE, DELETE and
  TRUNCATE on `AuditEvent`, and no access to `_prisma_migrations`. Default privileges cover
  future tables.
- A `BEFORE UPDATE` trigger on `AuditEvent` refuses updates for every role, including the owner.
  Deletes are *not* blocked by a trigger, so the owner-run FK cascade from organization deletion
  still works.
- `AuditEvent.recipientId` becomes `ON DELETE NO ACTION`. It's checked at the end of the statement,
  so whole-envelope or whole-org cascades still work, but evidence rows are never rewritten.
- Migrations run as the owner via `MIGRATE_DATABASE_URL`, and the app runs as the restricted role via
  `DATABASE_URL`.

## Consequences
- A bug or injection in the api or worker can't alter the trail. Doing so needs the owner
  credentials, and even then updates need the trigger dropped first.
- Deploys need two database URLs and a one-time `CREATE ROLE … IN ROLE sahihi_app`. Locally both
  URLs are the `sahihi` superuser, so only `audit-append-only.itest.ts` exercises the
  restrictions.
- Organization deletion still erases that org's audit trail. Whether evidence must outlive the
  tenant (a retention period, or an export before delete) is decided with the retention and DPA
  roadmap item. If it must, block the cascade then.
- Row-level security for tenant isolation is still planned as a separate layer.
