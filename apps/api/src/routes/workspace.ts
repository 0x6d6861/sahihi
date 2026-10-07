import { getEnv } from "@sahihi/config"
import { canEditWorkspace, logoProblem, WorkspaceLogoSchema, workspaceLogoUrl } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger, deleteObject, keys, putObject } from "@sahihi/infra"
import { pngFromDataUrl } from "@sahihi/pdf"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { badRequest, forbidden, parseJson } from "../lib/http"
import { requireOrg } from "../middleware/session"

/**
 * Workspace branding (docs/auth.md → Account settings). The name is changed through better-auth
 * (`organization.update`); the logo is ours because it lives in private storage and is served by
 * the public /api/branding route. `Organization.logo` keeps the public URL, so emails, the signing
 * page and the workspace switcher all read one field.
 */
const log = createLogger("workspace")

const requireEditor = createMiddleware<AppEnv>(async (c, next) => {
  if (!canEditWorkspace(c.get("memberRole"))) {
    forbidden("Only owners and admins can change the workspace")
  }
  await next()
})

export const workspace = new Hono<AppEnv>()
  .use(requireOrg)
  .use(requireEditor)

  .put("/logo", async (c) => {
    const { dataUrl } = await parseJson(c, WorkspaceLogoSchema)
    let png: Uint8Array
    try {
      png = pngFromDataUrl(dataUrl)
    } catch {
      badRequest("The logo must be a PNG image")
    }
    const problem = logoProblem(png)
    if (problem) badRequest(problem)

    const organizationId = c.get("organizationId")
    const version = crypto.randomUUID().slice(0, 8)
    const key = keys.logo(organizationId, version)
    await putObject(key, png, "image/png")

    const logo = workspaceLogoUrl(getEnv().WEB_URL, organizationId, version)
    const previous = await prisma.$transaction(async (tx) => {
      const before = await tx.workspaceSettings.findUnique({
        where: { organizationId },
        select: { logoKey: true },
      })
      await tx.workspaceSettings.upsert({
        where: { organizationId },
        create: { organizationId, logoKey: key },
        update: { logoKey: key },
      })
      await tx.organization.update({ where: { id: organizationId }, data: { logo } })
      return before?.logoKey ?? null
    })
    if (previous) await deleteObject(previous).catch((err) => log.warn("old logo kept", { err }))
    return c.json({ logo })
  })

  .delete("/logo", async (c) => {
    const organizationId = c.get("organizationId")
    const previous = await prisma.$transaction(async (tx) => {
      const before = await tx.workspaceSettings.findUnique({
        where: { organizationId },
        select: { logoKey: true },
      })
      if (before?.logoKey) {
        await tx.workspaceSettings.update({ where: { organizationId }, data: { logoKey: null } })
      }
      await tx.organization.update({ where: { id: organizationId }, data: { logo: null } })
      return before?.logoKey ?? null
    })
    if (previous) await deleteObject(previous).catch((err) => log.warn("logo kept", { err }))
    return c.body(null, 204)
  })
