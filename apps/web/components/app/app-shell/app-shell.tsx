"use client"

import {
  File02Icon,
  Folder01Icon,
  LicenseDraftIcon,
  SentIcon,
  SignatureIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { APP_NAV, type AppNavHref, isFullPage, isNavActive } from "@/lib/nav"
import { NotificationBell } from "../notifications/notification-bell"
import { PillNav } from "../pill-nav"
import { OrgSwitcher, type ShellOrganization } from "./org-switcher"
import { type ShellUser, UserMenu } from "./user-menu"

const NAV_ICONS: Record<AppNavHref, IconSvgElement> = {
  "/files": Folder01Icon,
  "/documents": File02Icon,
  "/envelopes": SentIcon,
  "/templates": LicenseDraftIcon,
}

/**
 * Authenticated app shell (ADR 0026): one top bar. The logo and the workspace switcher on the left,
 * the primary navigation as a segmented pill in the middle (the active item is a raised pill that
 * glides between items, `PillNav`), and on the right the notification bell and the account menu,
 * which also holds Settings. Below `md` the navigation moves to its own row under the bar.
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
    <div className="flex min-h-svh flex-col">
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

        <PillNav
          id="app-nav"
          label="Main"
          className="order-last flex w-full justify-center md:order-none md:w-auto"
          items={APP_NAV.map((item) => ({
            id: item.href,
            href: item.href,
            label: item.label,
            icon: NAV_ICONS[item.href],
            active: isNavActive(pathname, item.href),
          }))}
        />

        <div className="ml-auto flex items-center gap-3 md:ml-0 md:justify-self-end">
          {/* Keyed by workspace: switching starts the bell over for the new one. */}
          <NotificationBell key={activeOrganizationId} />
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}
