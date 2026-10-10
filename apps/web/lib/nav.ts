/**
 * Primary navigation of the authenticated app shell (the top bar's pill). Icons are attached in
 * the component. Settings is reached from the user menu only (ADR 0026).
 */
export const APP_NAV: readonly { href: AppNavHref; label: string }[] = [
  // Home (ADR 0038): documents, envelopes and templates together, in their shared folders.
  { href: "/files", label: "All files" },
  // Notifications, workspace activity and bulk sends (ADR 0041).
  { href: "/inbox", label: "Inbox" },
]

export type AppNavHref = "/files" | "/inbox"

/**
 * Pages that have no tab of their own and belong to one that does: documents, envelopes and
 * templates are listed in All files (ADR 0041), so their pages light up All files.
 */
const NAV_SECTION_FOR: readonly { prefix: string; href: AppNavHref }[] = [
  { prefix: "/documents", href: "/files" },
  { prefix: "/envelopes", href: "/files" },
  { prefix: "/templates", href: "/files" },
  { prefix: "/generate", href: "/files" },
  { prefix: "/bulk-sends", href: "/inbox" },
]

/** Where the app opens after sign-in, onboarding or a workspace switch (ADR 0038). */
export const HOME_HREF = "/files"

/**
 * Settings pages: the tab bar on every settings page. Your account first (profile, security,
 * notifications), then the active workspace. The user menu links to the first one.
 */
export const SETTINGS_NAV = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Plan & usage" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/api", label: "API" },
] as const

/** True when `pathname` is `href` itself or a page below it (`/inbox/x` → `/inbox`). */
function isAtOrBelow(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Whether the tab `href` is the current one for `pathname`, sections without a tab included. */
export function isNavActive(pathname: string, href: string): boolean {
  if (isAtOrBelow(pathname, href)) return true
  return NAV_SECTION_FOR.some((s) => s.href === href && isAtOrBelow(pathname, s.prefix))
}

/**
 * Full-page tools: the app shell hides its top bar and column, and the page fills the window with
 * its own bar and scroll areas: the draft envelope editor (`/envelopes/:id/edit`, ADR 0021,
 * ADR 0031) and the AI document generator (`/generate/:id`, docs/ai-documents.md).
 */
export function isFullPage(pathname: string): boolean {
  return /^\/envelopes\/[^/]+\/edit\/?$/.test(pathname) || /^\/generate\/[^/]+\/?$/.test(pathname)
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
