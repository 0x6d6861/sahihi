/**
 * Org branding for emails sent on an organization's behalf (signing requests and their outcomes).
 * Auth and OTP emails are Sahihi-branded and pass no brand.
 */
export interface Brand {
  organizationName: string
  /** Only set when safe to embed (see safeLogoUrl). */
  logoUrl: string | null
}

const MAX_LOGO_URL = 2048

/**
 * `Organization.logo` may have been set through better-auth's organization API, so treat it as
 * untrusted: only absolute https URLs are embedded (no http, data:, javascript: or relative paths).
 * The one exception is `trustedOrigin` (the web app's own origin, where uploaded logos are served),
 * which is accepted over http too so local development shows the logo. Anything else falls back to
 * the name.
 */
export function safeLogoUrl(
  logo: string | null | undefined,
  trustedOrigin?: string,
): string | null {
  if (!logo || logo.length > MAX_LOGO_URL) return null
  try {
    const url = new URL(logo)
    if (!url.hostname) return null
    if (url.protocol === "https:") return url.toString()
    if (trustedOrigin && url.protocol === "http:" && url.origin === new URL(trustedOrigin).origin)
      return url.toString()
    return null
  } catch {
    return null
  }
}

export function brandFor(
  org: { name: string; logo: string | null },
  trustedOrigin?: string,
): Brand {
  return { organizationName: org.name, logoUrl: safeLogoUrl(org.logo, trustedOrigin) }
}
