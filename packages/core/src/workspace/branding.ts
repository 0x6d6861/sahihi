import { z } from "zod"
import { PngDataUrlSchema } from "../account/profile"
import { pngDimensions } from "../shared/png"
import { hasPermission } from "./permissions"

/**
 * Settings → Workspace (docs/auth.md → Account settings): name and logo. The logo appears in emails
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
