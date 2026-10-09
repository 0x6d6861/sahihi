import { getEnv } from "@sahihi/config"
import { InvalidTransitionError, MAX_UPLOAD_BYTES } from "@sahihi/core"
import { EnvelopeError } from "@sahihi/envelopes"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { secureHeaders } from "hono/secure-headers"
import { ADMIN_QUEUES_PATH, adminDashboard } from "./admin"
import { auth } from "./auth"
import { reportRequestError, requestIdOf, requestLog } from "./middleware/request-log"
import { account } from "./routes/account"
import { activity } from "./routes/activity"
import { apiKeys } from "./routes/api-keys"
import { avatars } from "./routes/avatars"
import { billing } from "./routes/billing"
import { branding } from "./routes/branding"
import { bulkSends, startBulkSendRoute } from "./routes/bulk-sends"
import { data } from "./routes/data"
import { documents } from "./routes/documents"
import { embedding } from "./routes/embedding"
import { envelopes } from "./routes/envelopes"
import { files } from "./routes/files"
import { folders } from "./routes/folders"
import { generatedDocuments } from "./routes/generated-documents"
import { me } from "./routes/me"
import { notifications } from "./routes/notifications"
import { signing } from "./routes/signing"
import { templates } from "./routes/templates"
import { v1 } from "./routes/v1"
import { verify } from "./routes/verify"
import { webhooks } from "./routes/webhooks"
import { workspace } from "./routes/workspace"

const jsonLimit = bodyLimit({ maxSize: 8 * 1024 * 1024 })
const uploadLimit = bodyLimit({ maxSize: MAX_UPLOAD_BYTES })
const defaultHeaders = secureHeaders()
// Logos are embedded by mail clients on other origins, so they may be loaded cross-origin.
const brandingHeaders = secureHeaders({ crossOriginResourcePolicy: "cross-origin" })

export function createApp() {
  const env = getEnv()

  const app = new Hono()
    .use(requestLog)
    .use((c, next) =>
      c.req.path.startsWith("/api/branding/") ? brandingHeaders(c, next) : defaultHeaders(c, next),
    )
    .use(
      "/api/*",
      cors({
        origin: env.WEB_URL,
        credentials: true,
        allowHeaders: ["Content-Type", "Authorization"],
      }),
    )
    // Signature PNGs are the largest bodies (~500 KB each)
    .use("/api/*", (c, next) =>
      // Direct PDF upload through the public API takes the same 25 MB as the web upload.
      c.req.path === "/api/v1/documents" ? uploadLimit(c, next) : jsonLimit(c, next),
    )
    // Responses carry PII, presigned URLs and session data: no browser, proxy or CDN may store them.
    .use("/api/*", async (c, next) => {
      await next()
      if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store")
    })

    .get("/health", (c) => c.json({ ok: true }))
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

    .route("/api/documents", documents)
    .route("/api/folders", folders)
    .route("/api/files", files)
    .route("/api/envelopes", envelopes)
    .route("/api/templates", templates)
    .route("/api/generated-documents", generatedDocuments)
    .route("/api/templates/:id/bulk-sends", startBulkSendRoute)
    .route("/api/bulk-sends", bulkSends)
    .route("/api/billing", billing)
    .route("/api/me", me)
    .route("/api/account", account)
    .route("/api/notifications", notifications)
    .route("/api/activity", activity)
    .route("/api/avatars", avatars)
    .route("/api/workspace", workspace)
    .route("/api/branding", branding)
    .route("/api/data", data)
    .route("/api/api-keys", apiKeys)
    .route("/api/embedding", embedding)
    .route("/api/v1", v1)
    .route("/api/webhooks", webhooks)
    .route("/api/sign", signing)
    .route("/api/verify", verify)

  // Staff-only queue dashboard, when configured (docs/observability.md).
  const admin = adminDashboard()
  if (admin) app.route(ADMIN_QUEUES_PATH, admin)

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.res ?? c.json({ error: err.message }, err.status)
    }
    if (err instanceof EnvelopeError) return c.json(err.body, err.status)
    if (err instanceof InvalidTransitionError) {
      return c.json({ error: "invalid_state", message: err.message }, 409)
    }
    reportRequestError(err, requestIdOf(c.req.raw), c.req.path)
    return c.json({ error: "internal_error" }, 500)
  })

  return app
}

export type AppType = ReturnType<typeof createApp>
