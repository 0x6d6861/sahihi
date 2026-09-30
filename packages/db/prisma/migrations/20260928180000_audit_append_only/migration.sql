-- AuditEvent is append-only (ADR 0010, docs/security.md → Audit trail integrity).

-- 1. Evidence keeps its recipient link. NO ACTION is checked at the end of the statement, so
--    deleting a whole envelope or organization (which cascades to recipients AND audit events)
--    still works, but a recipient with audit events can't be deleted on its own, and audit rows
--    are never rewritten by SET NULL.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_recipientId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 2. No UPDATE, for anyone (including the table owner). Disabling this trigger needs the owner
--    and is itself a visible event.
CREATE FUNCTION "audit_event_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent rows are append-only'
    USING ERRCODE = 'insufficient_privilege', HINT = 'docs/security.md -> Audit trail integrity';
END
$$;

CREATE TRIGGER "AuditEvent_no_update"
  BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_append_only"();

-- 3. The role the api and worker run as. Group role (NOLOGIN): each environment creates a login
--    role IN ROLE sahihi_app (docs/security.md). It gets DML everywhere except UPDATE, DELETE and
--    TRUNCATE on AuditEvent, and nothing on Prisma's migration table. Migrations keep running as the
--    owner (MIGRATE_DATABASE_URL). Roles are cluster-wide, so create it only once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sahihi_app') THEN
    CREATE ROLE sahihi_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO sahihi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sahihi_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO sahihi_app;
-- Tables and sequences created by later migrations (run by this same owner) get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sahihi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO sahihi_app;

REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM sahihi_app;
-- Guarded: Prisma replays migrations into a shadow database that has no _prisma_migrations table.
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON "_prisma_migrations" FROM sahihi_app;
  END IF;
END
$$;
