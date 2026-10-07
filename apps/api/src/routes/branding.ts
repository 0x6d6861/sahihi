import { prisma } from "@sahihi/db"
import { getObjectBytes } from "@sahihi/infra"
import { Hono } from "hono"
import { rateLimit } from "../middleware/rate-limit"

/**
 * Public workspace logos (docs/auth.md → Account settings). Emails and signing pages embed them,
 * so they need a URL that works without a session and outlives a presigned link. Only the logo a
 * workspace chose is served: the object key comes from WorkspaceSettings, never from the request.
 * The `?v=` in the stored URL changes on every upload, which makes long caching safe.
 */
export const branding = new Hono()
  // Mail clients and image proxies fetch on every open; generous, but bounded.
  .use(rateLimit({ bucket: "branding", limit: 300, windowSec: 60 }))

  .get("/:orgId/logo.png", async (c) => {
    const settings = await prisma.workspaceSettings.findUnique({
      where: { organizationId: c.req.param("orgId") },
      select: { logoKey: true },
    })
    if (!settings?.logoKey) return c.json({ error: "not_found" }, 404)
    let bytes: Uint8Array
    try {
      bytes = await getObjectBytes(settings.logoKey)
    } catch {
      return c.json({ error: "not_found" }, 404)
    }
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'",
    })
  })
