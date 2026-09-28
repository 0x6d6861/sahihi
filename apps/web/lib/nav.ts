/** Primary navigation of the authenticated app shell. Icons are attached in the component. */
export const APP_NAV = [
  { href: "/documents", label: "Documents" },
  { href: "/envelopes", label: "Envelopes" },
] as const

export type AppNavHref = (typeof APP_NAV)[number]["href"]

/** True when `pathname` is `href` itself or a page below it (`/envelopes/abc` → `/envelopes`). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
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
