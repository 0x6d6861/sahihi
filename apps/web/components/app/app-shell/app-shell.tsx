"use client"

import { File02Icon, LicenseDraftIcon, SentIcon, SignatureIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { Separator } from "@/components/ui/separator"
import { APP_NAV, type AppNavHref, isFullBleed, isNavActive } from "@/lib/nav"
import { OrgSwitcher, type ShellOrganization } from "./org-switcher"
import { type ShellUser, UserMenu } from "./user-menu"

const NAV_ICONS: Record<AppNavHref, IconSvgElement> = {
  "/documents": File02Icon,
  "/envelopes": SentIcon,
  "/templates": LicenseDraftIcon,
}

/**
 * Authenticated app shell (ADR 0026): one top bar. The logo and the workspace switcher on the left,
 * the primary navigation as a segmented pill in the middle (the active item is a raised pill that
 * glides between items), and the account menu on the right, which also holds Settings. Below `md`
 * the navigation moves to its own row under the bar.
 */
export function AppShell({
  user,
  organizations,
  activeOrganizationId,
  children,
}: {
  user: ShellUser
  organizations: ShellOrganization[]
  activeOrganizationId: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const fullBleed = isFullBleed(pathname)

  return (
    // Full-bleed pages (the draft editor) get exactly the window's height and scroll inside.
    <div className={fullBleed ? "flex h-svh flex-col overflow-hidden" : "flex min-h-svh flex-col"}>
      <header className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/documents"
            aria-label="Sahihi home"
            className="flex shrink-0 items-center gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon
              icon={SignatureIcon}
              size={22}
              strokeWidth={2}
              aria-hidden
              // Arc's accent: the mark is the one coloured thing in the bar besides the active item.
              style={{ color: "var(--accent)" }}
            />
            <span className="max-sm:hidden">Sahihi</span>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <OrgSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
            />
          </div>
        </div>

        <nav
          aria-label="Main"
          className="order-last flex w-full justify-center md:order-none md:w-auto"
        >
          <LayoutGroup id="app-nav">
            <ul className="flex w-full items-center gap-1 rounded-full bg-muted p-1 md:w-auto">
              {APP_NAV.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={NAV_ICONS[item.href]}
                  active={isNavActive(pathname, item.href)}
                />
              ))}
            </ul>
          </LayoutGroup>
        </nav>

        <div className="ml-auto flex items-center md:ml-0 md:justify-self-end">
          <UserMenu user={user} />
        </div>
      </header>

      {fullBleed ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      )}
    </div>
  )
}

/**
 * One navigation pill. The active one carries the shared raised background (`layoutId`), so
 * moving between pages slides it instead of swapping it; reduced motion moves it instantly.
 */
function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: IconSvgElement
  active: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <li className="max-md:flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={
          active
            ? "relative isolate flex h-9 items-center justify-center gap-2 rounded-full px-3 font-medium sm:px-4 text-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : "relative isolate flex h-9 items-center justify-center gap-2 rounded-full px-3 text-muted-foreground sm:px-4 text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        {active && (
          <motion.span
            layoutId="app-nav-active"
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
            transition={reduced ? { duration: 0 } : motionTokens.spring.snappy}
          />
        )}
        <span className="flex max-sm:hidden">
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} aria-hidden />
        </span>
        <span>{label}</span>
      </Link>
    </li>
  )
}
