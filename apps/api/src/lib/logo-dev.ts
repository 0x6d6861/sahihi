import { getEnv } from "@sahihi/config"
import { logoDevUrl, workspaceIconProblem } from "@sahihi/core"
import { createLogger } from "@sahihi/infra"

/**
 * A workspace website's logo from logo.dev (docs/auth.md → Account settings), as a PNG small
 * enough to store, or null: no LOGO_DEV_TOKEN, logo.dev has no logo for the domain, or the call
 * failed. Only the domain is sent. The bytes are checked like any icon before they're kept.
 */
const log = createLogger("logo-dev")
const TIMEOUT_MS = 5000

export const logoDevConfigured = () => Boolean(getEnv().LOGO_DEV_TOKEN)

export async function fetchLogoDevIcon(website: string): Promise<Uint8Array | null> {
  const token = getEnv().LOGO_DEV_TOKEN
  if (!token) return null
  let res: Response
  try {
    res = await fetch(logoDevUrl(website, token), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/png" },
    })
  } catch (err) {
    // Only the error's name: a message could echo the URL, which carries the key.
    log.warn("logo.dev unreachable", { reason: err instanceof Error ? err.name : "unknown" })
    return null
  }
  if (res.status === 404) return null
  if (!res.ok) {
    log.warn("logo.dev refused", { status: res.status })
    return null
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const problem = workspaceIconProblem(bytes)
  if (problem) {
    log.warn("logo.dev icon refused", { problem })
    return null
  }
  return bytes
}
