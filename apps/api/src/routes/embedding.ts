import { EmbedSettingsSchema, hasPermission } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { forbidden, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * Origins allowed to embed signing in an iframe (docs/embedded-signing.md). Owners and admins
 * (`api:manage`, like API keys: both are developer integration settings).
 */
const requireApiManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!hasPermission(c.get("memberRole"), { api: ["manage"] })) {
    forbidden("Only owners and admins can change embedding settings")
  }
  await next()
})

export const embedding = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireApiManager)

  .get("/", async (c) => {
    const s = await prisma.workspaceSettings.findUnique({
      where: { organizationId: c.get("organizationId") },
      select: { embedOrigins: true },
    })
    return c.json({ origins: s?.embedOrigins ?? [] })
  })

  .put("/", async (c) => {
    const { origins } = await parseJson(c, EmbedSettingsSchema)
    const organizationId = c.get("organizationId")
    await prisma.workspaceSettings.upsert({
      where: { organizationId },
      create: { organizationId, embedOrigins: origins },
      update: { embedOrigins: origins },
    })
    return c.json({ origins })
  })
