import pg from "pg"

/**
 * A dedicated, unpooled connection for `LISTEN` (ADR 0057). It must be a direct connection to
 * Postgres: a transaction-mode pooler (PgBouncer) doesn't deliver notifications. The caller
 * connects it, handles `error`/`end` and closes it.
 */
export function openListenClient(connectionString: string): pg.Client {
  return new pg.Client({ connectionString })
}
