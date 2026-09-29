import { createBullBoard } from "@bull-board/api"
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter"
import { HonoAdapter } from "@bull-board/hono"
import { getEnv } from "@sahihi/config"
import { redact, timingSafeEqual } from "@sahihi/core"
import { getQueues } from "@sahihi/infra"
import { Hono } from "hono"
import { basicAuth } from "hono/basic-auth"
import { serveStatic } from "hono/bun"
import { rateLimit } from "./middleware/rate-limit"

export const ADMIN_QUEUES_PATH = "/admin/queues"

/**
 * The only write the dashboard allows: retrying failed jobs (one, or all of a status). Adding,
 * editing, deleting, emptying or re-prioritising jobs is refused, so the dashboard can't be used to
 * send arbitrary emails (e.g. a crafted envelope.invite) or to corrupt job data.
 */
const ALLOWED_WRITE = /\/api\/queues\/[^/]+\/(?:[^/]+\/retry|retry\/[^/]+)$/

/**
 * Staff-only BullMQ dashboard (docs/observability.md). Mounted only when ADMIN_DASHBOARD_USER and
 * ADMIN_DASHBOARD_PASSWORD are set; HTTP Basic auth, rate-limited, retry-only for writes. Job data
 * and return values are redacted, because invite/reminder/OTP jobs carry raw signing tokens and
 * codes (rule 8).
 */
export function adminDashboard(): Hono | null {
  const env = getEnv()
  if (!env.ADMIN_DASHBOARD_USER || !env.ADMIN_DASHBOARD_PASSWORD) return null
  const user = env.ADMIN_DASHBOARD_USER
  const password = env.ADMIN_DASHBOARD_PASSWORD

  const queues = getQueues()
  const adapters = [queues.notifications, queues.finalize, queues.maintenance, queues.webhooks].map(
    (q) => {
      const adapter = new BullMQAdapter(q.raw)
      adapter.setFormatter("data", (data) => redact(data))
      adapter.setFormatter("returnValue", (value) => redact(value))
      return adapter
    },
  )
  const serverAdapter = new HonoAdapter(serveStatic)
  serverAdapter.setBasePath(ADMIN_QUEUES_PATH)
  createBullBoard({
    queues: adapters,
    serverAdapter,
    options: { uiConfig: { boardTitle: "Sahihi queues" } },
  })

  return new Hono()
    .use("*", rateLimit({ bucket: "admin", limit: 60, windowSec: 60 }))
    .use(
      "*",
      basicAuth({
        verifyUser: (u, p) => timingSafeEqual(u, user) && timingSafeEqual(p, password),
        realm: "Sahihi staff",
      }),
    )
    .use("*", async (c, next) => {
      if (c.req.method !== "GET" && !ALLOWED_WRITE.test(c.req.path)) {
        return c.json({ error: "read_only", message: "Only retrying jobs is allowed here" }, 405)
      }
      await next()
    })
    .route("/", serverAdapter.registerPlugin())
}
