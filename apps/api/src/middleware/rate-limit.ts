import { redis } from "@sahihi/infra"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import { clientMeta } from "../lib/http"

/**
 * Fixed-window rate limiter backed by Redis. Use on every PUBLIC route
 * (signing, verification, OTP). Keyed by IP + route bucket by default.
 */
export function rateLimit(opts: {
  bucket: string
  limit: number
  windowSec: number
  key?: (c: Context) => string
}) {
  return createMiddleware(async (c, next) => {
    const id = opts.key?.(c) ?? clientMeta(c).ipAddress ?? "unknown"
    const window = Math.floor(Date.now() / 1000 / opts.windowSec)
    const key = `rl:${opts.bucket}:${id}:${window}`
    const count = await redis().incr(key)
    if (count === 1) await redis().expire(key, opts.windowSec)
    c.header("X-RateLimit-Limit", String(opts.limit))
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - count)))
    if (count > opts.limit) return c.json({ error: "rate_limited" }, 429)
    await next()
  })
}
