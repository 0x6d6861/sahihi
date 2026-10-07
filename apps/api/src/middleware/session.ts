import { prisma } from "@sahihi/db"
import { createMiddleware } from "hono/factory"
import { auth } from "../auth"
import type { AppEnv } from "../lib/env"

/**
 * Requires a signed-in user with an ACTIVE organization they belong to.
 * Sets c.var.user / session / organizationId / memberRole.
 * Every tenant-scoped route must sit behind this.
 */
export const requireOrg = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!result) return c.json({ error: "unauthorized" }, 401)

  const organizationId = result.session.activeOrganizationId
  if (!organizationId) return c.json({ error: "no_active_organization" }, 403)

  const member = await prisma.member.findFirst({
    where: { organizationId, userId: result.user.id },
    select: { role: true },
  })
  if (!member) return c.json({ error: "forbidden" }, 403)

  c.set("user", result.user)
  c.set("session", result.session)
  c.set("organizationId", organizationId)
  c.set("memberRole", member.role)
  await next()
})

/**
 * Requires a signed-in user, with or without an active organization: account settings
 * (`/api/me`) belong to the person, not to a workspace. Sets c.var.user / session.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!result) return c.json({ error: "unauthorized" }, 401)
  c.set("user", result.user)
  c.set("session", result.session)
  await next()
})
