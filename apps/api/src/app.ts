import { getEnv } from "@sahihi/config"
import { InvalidTransitionError } from "@sahihi/core"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { auth } from "./auth"
import { documents } from "./routes/documents"
import { envelopes } from "./routes/envelopes"
import { signing } from "./routes/signing"
import { templates } from "./routes/templates"
import { verify } from "./routes/verify"
import { webhooks } from "./routes/webhooks"

export function createApp() {
  const env = getEnv()

  const app = new Hono()
    .use(logger())
    .use(secureHeaders())
    .use(
      "/api/*",
      cors({
        origin: env.WEB_URL,
        credentials: true,
        allowHeaders: ["Content-Type", "Authorization"],
      }),
    )
    // Signature PNGs are the largest bodies (~500 KB each)
    .use("/api/*", bodyLimit({ maxSize: 8 * 1024 * 1024 }))
    // Responses carry PII, presigned URLs and session data: no browser, proxy or CDN may store them.
    .use("/api/*", async (c, next) => {
      await next()
      if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store")
    })

    .get("/health", (c) => c.json({ ok: true }))
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))

    .route("/api/documents", documents)
    .route("/api/envelopes", envelopes)
    .route("/api/templates", templates)
    .route("/api/webhooks", webhooks)
    .route("/api/sign", signing)
    .route("/api/verify", verify)

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return err.res ?? c.json({ error: err.message }, err.status)
    }
    if (err instanceof InvalidTransitionError) {
      return c.json({ error: "invalid_state", message: err.message }, 409)
    }
    console.error(err)
    return c.json({ error: "internal_error" }, 500)
  })

  return app
}

export type AppType = ReturnType<typeof createApp>
