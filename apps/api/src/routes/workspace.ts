import { getEnv } from "@sahihi/config"
import {
  canEditWorkspace,
  logoProblem,
  normalizeWebsite,
  WorkspaceLogoSchema,
  WorkspaceWebsiteSchema,
  workspaceIconPath,
  workspaceLogoUrl,
} from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger, keys, releaseObject, storageFor } from "@sahihi/infra"
import { pngFromDataUrl } from "@sahihi/pdf"
import { Hono } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "../lib/env"
import { badRequest, forbidden, notFound, parseJson } from "../lib/http"
import { fetchLogoDevIcon, logoDevConfigured } from "../lib/logo-dev"
import { rateLimit } from "../middleware/rate-limit"
import { requireOrg } from "../middleware/session"

/**
 * Workspace branding (docs/auth.md → Account settings). The name is changed through better-auth
 * (`organization.update`); the logo, website and icon are ours because they live in private
 * storage. The logo is served by the public /api/branding route and `Organization.logo` keeps its
 * URL, so emails and the signing page read one field. The website's logo (from logo.dev) is only
 * the active workspace's mark in the switcher: GET /icon.png serves it to members of the
 * session's active workspace and nobody else.
 */
const log = createLogger("workspace")

const requireEditor = createMiddleware<AppEnv>(async (c, next) => {
  if (!canEditWorkspace(c.get("memberRole"))) {
    forbidden("Only owners and admins can change the workspace")
  }
  await next()
})

/** Same-origin path for a stored icon: the `{version}` in `org/{id}/branding/icon-{version}.png`. */
function iconPathFor(key: string): string | null {
  const version = key.match(/icon-([^/]+)\.png$/)?.[1]
  return version ? workspaceIconPath(version) : null
}

/**
 * Replaces the stored icon with `website`'s logo from logo.dev, or removes it when there's no
 * website or logo.dev has none; a failed fetch keeps the current icon. Only written while the website is still `website`, so a slow fetch can't
 * attach an old site's logo. Returns the new icon path, or null.
 */
async function refreshIcon(organizationId: string, website: string | null): Promise<string | null> {
  const fetched = website ? await fetchLogoDevIcon(website) : ({ status: "none" } as const)
  if (fetched.status === "failed") {
    // Couldn't tell whether there's a logo: keep the current icon.
    const current = await prisma.workspaceSettings.findUnique({
      where: { organizationId },
      select: { iconKey: true },
    })
    return current?.iconKey ? iconPathFor(current.iconKey) : null
  }
  const png = fetched.status === "found" ? fetched.png : null
  let key: string | null = null
  if (png) {
    key = keys.icon(organizationId, crypto.randomUUID().slice(0, 8))
    await (await storageFor(organizationId)).put(key, png, "image/png")
  }
  const outcome = await prisma.$transaction(async (tx) => {
    const before = await tx.workspaceSettings.findUnique({
      where: { organizationId },
      select: { website: true, iconKey: true },
    })
    if (!before || before.website !== website) return { stored: false, unused: key }
    await tx.workspaceSettings.update({ where: { organizationId }, data: { iconKey: key } })
    return { stored: true, unused: before.iconKey }
  })
  // The replaced icon, or our own upload when the website changed meanwhile.
  if (outcome.unused) {
    await releaseObject(organizationId, outcome.unused, "REPLACED").catch((err) =>
      log.warn("old icon kept", { err }),
    )
  }
  return outcome.stored && key ? iconPathFor(key) : null
}

export const workspace = new Hono<AppEnv>()
  .use(requireOrg)

  // Everyone in the workspace may read these; only editors change them.
  .get("/", async (c) => {
    const settings = await prisma.workspaceSettings.findUnique({
      where: { organizationId: c.get("organizationId") },
      select: { website: true, iconKey: true },
    })
    return c.json({
      website: settings?.website ?? null,
      icon: settings?.iconKey ? iconPathFor(settings.iconKey) : null,
      iconsAvailable: logoDevConfigured(),
    })
  })

  .get("/icon.png", async (c) => {
    const organizationId = c.get("organizationId")
    const settings = await prisma.workspaceSettings.findUnique({
      where: { organizationId },
      select: { iconKey: true },
    })
    if (!settings?.iconKey) notFound("Icon")
    let bytes: Uint8Array
    try {
      bytes = await (await storageFor(organizationId)).get(settings.iconKey)
    } catch {
      notFound("Icon")
    }
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "image/png",
      // The URL carries ?v=, but the same path serves whichever workspace is active: keep it private.
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
    })
  })

  /**
   * Setting or changing the website fetches its logo from logo.dev as the switcher icon; clearing
   * it drops the icon. Saving the same website again keeps what's there.
   */
  .put("/website", requireEditor, async (c) => {
    const body = await parseJson(c, WorkspaceWebsiteSchema)
    let website: string | null = null
    if (body.website) {
      const checked = normalizeWebsite(body.website)
      if (!checked.ok) badRequest(checked.message)
      website = checked.website
    }
    const organizationId = c.get("organizationId")
    const before = await prisma.workspaceSettings.findUnique({
      where: { organizationId },
      select: { website: true, iconKey: true },
    })
    await prisma.workspaceSettings.upsert({
      where: { organizationId },
      create: { organizationId, website },
      update: { website },
    })
    if (before?.website === website && before.iconKey) {
      return c.json({ website, icon: iconPathFor(before.iconKey) })
    }
    return c.json({ website, icon: await refreshIcon(organizationId, website) })
  })

  /** "Fetch icon again": logo.dev may have a newer logo. Each call is an outbound request. */
  .post(
    "/icon/refresh",
    requireEditor,
    rateLimit({
      bucket: "workspace-icon",
      limit: 20,
      windowSec: 3600,
      key: (c) => c.get("organizationId"),
    }),
    async (c) => {
      const organizationId = c.get("organizationId")
      const settings = await prisma.workspaceSettings.findUnique({
        where: { organizationId },
        select: { website: true },
      })
      if (!settings?.website) badRequest("Add the website first")
      return c.json({ icon: await refreshIcon(organizationId, settings.website) })
    },
  )

  .put("/logo", requireEditor, async (c) => {
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
    await (await storageFor(organizationId)).put(key, png, "image/png")

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
    if (previous) {
      await releaseObject(organizationId, previous, "REPLACED").catch((err) =>
        log.warn("old logo kept", { err }),
      )
    }
    return c.json({ logo })
  })

  .delete("/logo", requireEditor, async (c) => {
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
    if (previous) {
      await releaseObject(organizationId, previous, "DELETED").catch((err) =>
        log.warn("logo kept", { err }),
      )
    }
    return c.body(null, 204)
  })
