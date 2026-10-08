import pg from "pg"

type Query = pg.ClientBase["query"]

/**
 * Makes one pg connection run its queries one at a time, in order.
 *
 * Inside a transaction (interactive or a `$transaction([...])` batch) Prisma's query engine sends a
 * query's relation loads (`include`, nested `select`) at the same time, and they all go to the
 * transaction's single connection. pg queues them itself, but that queueing is deprecated ("Calling
 * client.query() when the client is already executing a query", removed in pg@9). This is the
 * "external async flow control" pg asks for: the same order and the same one-at-a-time execution
 * as before, without relying on pg's internal queue.
 *
 * Callback-style calls (pg's own Pool uses them) and Submittables pass through untouched.
 */
export function serializeQueries(client: Pick<pg.ClientBase, "query">): void {
  const query = client.query.bind(client) as (...args: unknown[]) => unknown
  let tail: Promise<unknown> = Promise.resolve()
  client.query = ((...args: unknown[]) => {
    const first = args[0] as { submit?: unknown } | undefined
    if (typeof args.at(-1) === "function" || typeof first?.submit === "function") {
      return query(...args)
    }
    const run = tail.then(() => query(...args))
    // The next query waits for this one to finish, whether it succeeds or fails.
    tail = run.catch(() => {})
    return run
  }) as Query
}

/** A pg pool whose connections run one query at a time (`serializeQueries`). */
export function createSerializedPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString })
  pool.on("connect", (client) => serializeQueries(client))
  return pool
}
