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
 * `Organization.logo` is set by org members, so treat it as untrusted: only absolute https URLs are
 * embedded (no http, data:, javascript: or relative paths). Anything else falls back to the name.
 */
export function safeLogoUrl(logo: string | null | undefined): string | null {
  if (!logo || logo.length > MAX_LOGO_URL) return null
  try {
    const url = new URL(logo)
    return url.protocol === "https:" && url.hostname ? url.toString() : null
  } catch {
    return null
  }
}

export function brandFor(org: { name: string; logo: string | null }): Brand {
  return { organizationName: org.name, logoUrl: safeLogoUrl(org.logo) }
}
