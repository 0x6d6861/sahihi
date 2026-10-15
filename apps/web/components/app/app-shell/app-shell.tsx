"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { LogoMark } from "@/components/app/logo"
import { Separator } from "@/components/ui/separator"
import { APP_NAV, HOME_HREF, isFullPage, isNavActive } from "@/lib/nav"
import { UnreadCountProvider, useUnreadCount } from "../inbox/unread-count"
import { PillNav } from "../pill-nav"
import { GlobalSearch } from "./global-search"
import { NAV_ICONS } from "./nav-icons"
import { OrgSwitcher, type ShellOrganization } from "./org-switcher"
import { type ShellUser, UserMenu } from "./user-menu"

/**
 * Authenticated app shell (ADR 0026): one 56px top bar. The logo, the workspace switcher and the
 * primary navigation as a segmented pill on the left (the active item is a raised pill that glides
 * between items, `PillNav`; the Inbox shows its unread count, ADR 0041); search and the account
 * menu, which also holds Settings, on the right. Below `md` the navigation moves to its own row under the bar.
 * Full-page tools (`isFullPage`, the draft editor) get no shell at all: they have their own bar.
 */
export function AppShell({
  user,
  organizations,
  activeOrganizationId,
  activeIcon,
  children,
}: {
  user: ShellUser
  organizations: ShellOrganization[]
  activeOrganizationId: string
  /** Same-origin path of the active workspace's website icon, or null. */
  activeIcon: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  // Full-page tools (the draft editor, ADR 0031) bring their own top bar and fill the window.
  if (isFullPage(pathname)) {
    return <div className="flex h-svh flex-col overflow-hidden">{children}</div>
  }

  return (
    <UnreadCountProvider workspaceId={activeOrganizationId}>
      <Shell
        user={user}
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        activeIcon={activeIcon}
      >
        {children}
      </Shell>
    </UnreadCountProvider>
  )
}

function Shell({
  user,
  organizations,
  activeOrganizationId,
  activeIcon,
  children,
}: {
  user: ShellUser
  organizations: ShellOrganization[]
  activeOrganizationId: string
  /** Same-origin path of the active workspace's website icon, or null. */
  activeIcon: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const { count: unread } = useUnreadCount()
  const scrolled = useScrolled()
  return (
    <div className="app-canvas flex min-h-svh flex-col">
      {/* A hairline at the top of the page; a soft shadow once content scrolls under the bar. */}
      <header
        data-scrolled={scrolled || undefined}
        className="sticky top-0 z-30 shrink-0 border-b bg-background transition-shadow duration-(--duration-fast) ease-(--ease-standard) data-scrolled:shadow-(--shadow-raised)"
      >
        {/* One row (the design's top bar): logo, workspace and the nav on the left, search and the
            avatar on the right. Below md the nav gets its own full-width row. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:h-14 md:flex-nowrap md:px-6 md:py-0">
          <Link
            href={HOME_HREF}
            aria-label="Sahihi home"
            className="flex shrink-0 items-center gap-2 rounded-md font-medium text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogoMark className="size-[0.85em]" />
            <span className="max-sm:hidden">Sahihi</span>
          </Link>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <OrgSwitcher
              organizations={organizations}
              activeOrganizationId={activeOrganizationId}
              activeIcon={activeIcon}
            />
          </div>

          <PillNav
            id="app-nav"
            label="Main"
            className="order-last flex w-full justify-center md:order-none md:ms-1 md:w-auto md:shrink-0"
            items={APP_NAV.map((item) => ({
              id: item.href,
              href: item.href,
              label: item.label,
              icon: NAV_ICONS[item.href],
              active: isNavActive(pathname, item.href),
              ...(item.href === "/inbox" ? { badge: unread ?? 0 } : {}),
            }))}
          />

          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="w-full max-w-36 md:max-w-70">
              <GlobalSearch workspaceId={activeOrganizationId} />
            </div>
            <UserMenu user={user} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}

/** Whether the window has scrolled at all: the top bar's shadow (docs/ui.md → Surfaces). */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])
  return scrolled
}
