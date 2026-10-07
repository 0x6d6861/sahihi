/**
 * Pure helpers for Settings → Profile, Security and Workspace (docs/auth.md → Account settings).
 * DOM-free so `bun test` covers them.
 */

const LOGO_PATH = /^\/api\/branding\/[^/]+\/logo\.png$/

/**
 * The workspace logo as a same-origin path, or null. `Organization.logo` holds an absolute URL
 * for emails; pages load it from their own origin (CSP `img-src 'self'`), and anything that
 * isn't our branding route is ignored.
 */
export function brandingLogoPath(logo: string | null | undefined): string | null {
  if (!logo) return null
  try {
    const url = new URL(logo, "http://local.invalid")
    return LOGO_PATH.test(url.pathname) ? `${url.pathname}${url.search}` : null
  } catch {
    return null
  }
}

/** The base32 secret in an `otpauth://` URI, in groups of four for typing into an app by hand. */
export function totpSecretFromUri(uri: string): string | null {
  try {
    const secret = new URL(uri).searchParams.get("secret")
    return secret ? (secret.match(/.{1,4}/g)?.join(" ") ?? secret) : null
  } catch {
    return null
  }
}

/** Backup codes as a small text file the user can keep. */
export function backupCodesText(codes: string[], email: string): string {
  return [
    "Sahihi backup codes",
    `Account: ${email}`,
    "Each code works once, in place of your authenticator app.",
    "",
    ...codes,
    "",
  ].join("\n")
}

/** Workspace logos are resized in the browser to fit this box (LOGO_MAX_* in @sahihi/core). */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
