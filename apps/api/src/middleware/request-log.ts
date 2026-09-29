import { captureError, createLogger } from "@sahihi/infra"
import { createMiddleware } from "hono/factory"

export const log = createLogger("api")

const requestIds = new WeakMap<Request, string>()
/** The id `requestLog` assigned to this request (for error reports). */
export const requestIdOf = (req: Request) => requestIds.get(req)

/**
 * One structured line per request (docs/observability.md): method, path with signing tokens
 * masked, status, duration and a request id (from `x-request-id`, else generated), which is also
 * returned to the client. Replaces hono/logger, which printed raw tokens from /api/sign/<token>.
 */
export const requestLog = createMiddleware(async (c, next) => {
  const started = performance.now()
  const incoming = c.req.header("x-request-id")
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID()
  requestIds.set(c.req.raw, requestId)
  c.header("x-request-id", requestId)
  await next()
  const status = c.res.status
  const fields = {
    requestId,
    method: c.req.method,
    status,
    ms: Math.round(performance.now() - started),
  }
  const line = `${c.req.method} ${c.req.path} ${status}`
  if (status >= 500) log.error(line, fields)
  else if (c.req.path === "/health") log.debug(line, fields)
  else log.info(line, fields)
})

/** Unexpected errors: logged (redacted) and sent to error tracking with the request id. */
export function reportRequestError(err: unknown, requestId: string | undefined, path: string) {
  log.error("unhandled error", { requestId, path, err })
  captureError(err, { requestId, path })
}
