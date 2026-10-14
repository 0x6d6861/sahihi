import pg from "pg"

/**
 * A dedicated, unpooled connection for `LISTEN` (ADR 0057). It must be a direct connection to
 * Postgres: a transaction-mode pooler (PgBouncer) doesn't deliver notifications. The caller
 * connects it, handles `error`/`end` and closes it.
 */
export function createListenClient(connectionString = process.env.DATABASE_URL): pg.Client {
  if (!connectionString) throw new Error("DATABASE_URL is not set")
  return new pg.Client({ connectionString })
}
