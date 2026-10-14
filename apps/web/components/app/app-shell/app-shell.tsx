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
 * Authenticated app shell (ADR 0026): one top bar. The logo and the workspace switcher on the left,
 * the primary navigation as a segmented pill in the middle (the active item is a raised pill that
 * glides between items, `PillNav`; the Inbox shows its unread count, ADR 0041), and on the right the
 * account menu, which also holds Settings. Below `md` the navigation moves to its own row under the bar.
 * Full-page tools (`isFullPage`, the draft editor) get no shell at all: they have their own bar.
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
  // Full-page tools (the draft editor, ADR 0031) bring their own top bar and fill the window.
  if (isFullPage(pathname)) {
    return <div className="flex h-svh flex-col overflow-hidden">{children}</div>
  }

  return (
    <UnreadCountProvider workspaceId={activeOrganizationId}>
      <Shell user={user} organizations={organizations} activeOrganizationId={activeOrganizationId}>
        {children}
      </Shell>
    </UnreadCountProvider>
  )
}

function Shell({
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
  const { count: unread } = useUnreadCount()
  const scrolled = useScrolled()
  return (
    <div className="app-canvas flex min-h-svh flex-col">
      {/* A hairline at the top of the page; a soft shadow once content scrolls under the bar. */}
      <header
        data-scrolled={scrolled || undefined}
        className="sticky top-0 z-30 shrink-0 border-b bg-background transition-shadow duration-(--duration-fast) ease-(--ease-standard) data-scrolled:shadow-(--shadow-raised)"
      >
        {/* From md, three columns: logo and workspace on the left edge, the avatar on the right,
            and between them the page's column (the side columns are as wide as <main>'s margins),
            so the pill lines up with the page title and the search field ends on the content's
            right edge. A side column never shrinks below its contents: when the margin is too
            narrow for the logo and workspace (under ~1700px), the pill follows the workspace menu;
            the search field stays aligned from ~1280px. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:grid md:grid-cols-[minmax(max-content,calc((100%_-_72rem)/2))_minmax(0,1fr)_minmax(max-content,calc((100%_-_72rem)/2))] md:gap-x-0 md:px-6">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <Link
              href={HOME_HREF}
              aria-label="Sahihi home"
              className="flex shrink-0 items-center gap-2 rounded-md font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogoMark className="size-[1.1rem]" />
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

          <div className="max-md:contents md:flex md:min-w-0 md:items-center md:gap-3 md:px-8">
            <PillNav
              id="app-nav"
              label="Main"
              className="order-last flex w-full justify-center md:order-none md:w-auto md:shrink-0"
              items={APP_NAV.map((item) => ({
                id: item.href,
                href: item.href,
                label: item.label,
                icon: NAV_ICONS[item.href],
                active: isNavActive(pathname, item.href),
                ...(item.href === "/inbox" ? { badge: unread ?? 0 } : {}),
              }))}
            />

            {/* Search fills the space after the nav, its right edge on the page content's right
                edge from md (the middle column ends at <main>'s gutter). */}
            <div className="flex min-w-0 flex-1 justify-end">
              <div className="w-full max-w-36 md:max-w-sm">
                <GlobalSearch workspaceId={activeOrganizationId} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3">
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
