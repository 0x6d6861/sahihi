/**
 * Primary navigation of the authenticated app shell (the top bar's pill). Icons are attached in
 * the component. Settings is reached from the user menu only (ADR 0026).
 */
export const APP_NAV: readonly { href: AppNavHref; label: string }[] = [
  { href: "/documents", label: "Documents" },
  { href: "/envelopes", label: "Envelopes" },
  { href: "/templates", label: "Templates" },
]

export type AppNavHref = "/documents" | "/envelopes" | "/templates"

/**
 * Settings pages: the tab bar on every settings page. Your account first (profile, security), then
 * the active workspace. The user menu links to the first one.
 */
export const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Plan & usage" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/api", label: "API" },
] as const

/** True when `pathname` is `href` itself or a page below it (`/envelopes/abc` → `/envelopes`). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Pages that fill the shell edge to edge instead of the centred, padded column: the draft envelope
 * editor (`/envelopes/:id/edit`, ADR 0021) brings its own rail, top bar and scroll areas.
 */
export function isFullBleed(pathname: string): boolean {
  return /^\/envelopes\/[^/]+\/edit\/?$/.test(pathname)
}

/** Up to two initials for an avatar fallback, from the name or else the email. */
export function initials(name: string | null | undefined, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length > 0) {
    const first = words[0]?.[0] ?? ""
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : ""
    return (first + last).toUpperCase()
  }
  return (email[0] ?? "?").toUpperCase()
}
