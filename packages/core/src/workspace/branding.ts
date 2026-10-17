import { z } from "zod"
import { PngDataUrlSchema } from "../account/profile"
import { checkWebhookUrl } from "../integrations/webhooks"
import { pngDimensions } from "../shared/png"
import { hasPermission } from "./permissions"

/**
 * Settings → Workspace (docs/auth.md → Account settings): name, website and logo.
 * The website's logo (from logo.dev) is the active workspace's mark in the switcher, nothing else. The logo appears in emails
 * sent on the workspace's behalf, on signing pages and in the workspace switcher.
 */

export const UpdateWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters").max(80),
})
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>

/**
 * The browser resizes the chosen image into this box and exports a PNG, so storage only ever
 * holds a small, metadata-free PNG. Emails show it 32 px high.
 */
export const LOGO_MAX_WIDTH = 640
export const LOGO_MAX_HEIGHT = 160
/** Upper bound for the decoded PNG (a 640×160 PNG is far smaller in practice). */
export const MAX_LOGO_BYTES = 400 * 1024

export const WorkspaceLogoSchema = z.object({ dataUrl: PngDataUrlSchema })

/**
 * Public URL stored in `Organization.logo`: served by GET /api/branding/:orgId/logo.png on the web
 * origin. `version` changes with every upload so emails and browsers never show a stale logo.
 */
export function workspaceLogoUrl(webUrl: string, organizationId: string, version: string): string {
  return `${webUrl.replace(/\/+$/, "")}/api/branding/${encodeURIComponent(organizationId)}/logo.png?v=${encodeURIComponent(version)}`
}

/** Rename the workspace or change its logo: better-auth's `organization:update` (owner, admin). */
export function canEditWorkspace(role: string): boolean {
  return hasPermission(role, { organization: ["update"] })
}

/** Leaving is open to everyone except the last owner (better-auth refuses it too). */
export function canLeaveWorkspace(role: string, ownerCount: number): boolean {
  const isOwner = role
    .split(",")
    .map((r) => r.trim())
    .includes("owner")
  return !isOwner || ownerCount > 1
}

/** Why a logo PNG is refused, or null when it's acceptable. */
export function logoProblem(bytes: Uint8Array): string | null {
  const size = pngDimensions(bytes)
  if (!size) return "The logo must be a PNG image"
  if (bytes.length > MAX_LOGO_BYTES) return "The logo is too large"
  if (size.width < 1 || size.height < 1) return "The logo is empty"
  if (size.width > LOGO_MAX_WIDTH || size.height > LOGO_MAX_HEIGHT)
    return `The logo must fit in ${LOGO_MAX_WIDTH}×${LOGO_MAX_HEIGHT} pixels`
  return null
}

// ── Website and its icon ─────────────────────────────────────────────────────

export const WorkspaceWebsiteSchema = z.object({
  website: z.string().trim().max(200).nullable(),
})

export type WebsiteCheck = { ok: true; website: string } | { ok: false; message: string }

/**
 * Normalizes what an admin types ("acme.co.tz", "https://www.acme.co.tz/about") into the site's
 * origin. Hosts that can't be a public site (localhost, private IPs, single labels) are refused,
 * as for webhooks; plain http is accepted (many small sites still serve it).
 */
export function normalizeWebsite(raw: string): WebsiteCheck {
  const input = raw.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { ok: false, message: "Enter a website address, e.g. acme.co.tz" }
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return { ok: false, message: "Enter a website address, e.g. acme.co.tz" }
  }
  // Only the host matters from here: checkWebhookUrl's https rule isn't one websites must follow.
  if (!checkWebhookUrl(`https://${url.host}/`).ok) {
    return { ok: false, message: "The website must be a public address" }
  }
  return { ok: true, website: url.origin }
}

/** The icon is fetched at this size (logo.dev `size`) and shown at 22 px in the switcher. */
export const WORKSPACE_ICON_SIZE = 64

/**
 * logo.dev image URL for a website (https://www.logo.dev/docs): the domain without `www.`, a
 * 64 px PNG, and a 404 instead of logo.dev's generated monogram when it has no logo, so the
 * switcher keeps its own initials.
 */
export function logoDevUrl(website: string, token: string): string {
  const domain = new URL(website).hostname.replace(/^www\./, "")
  const params = new URLSearchParams({
    token,
    size: String(WORKSPACE_ICON_SIZE),
    format: "png",
    fallback: "404",
  })
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params}`
}

/** Same-origin path of the active workspace's icon; `version` busts caches on every change. */
export function workspaceIconPath(version: string): string {
  return `/api/workspace/icon.png?v=${encodeURIComponent(version)}`
}

/** Why an icon PNG is refused, or null when it's acceptable. */
export function workspaceIconProblem(bytes: Uint8Array): string | null {
  const size = pngDimensions(bytes)
  if (!size) return "The icon must be a PNG image"
  if (bytes.length > MAX_LOGO_BYTES) return "The icon is too large"
  if (size.width < 1 || size.height < 1) return "The icon is empty"
  if (size.width > WORKSPACE_ICON_SIZE || size.height > WORKSPACE_ICON_SIZE)
    return `The icon must fit in ${WORKSPACE_ICON_SIZE}×${WORKSPACE_ICON_SIZE} pixels`
  return null
}
