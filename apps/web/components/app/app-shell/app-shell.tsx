"use client"

import { File02Icon, LicenseDraftIcon, SentIcon, SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { APP_NAV, type AppNavHref, isNavActive } from "@/lib/nav"
import { OrgSwitcher, type ShellOrganization } from "./org-switcher"
import { type ShellUser, UserMenu } from "./user-menu"

const NAV_ICONS: Record<AppNavHref, IconSvgElement> = {
  "/documents": File02Icon,
  "/envelopes": SentIcon,
  "/templates": LicenseDraftIcon,
}

/**
 * Authenticated app shell: coss Sidebar in its inset variant (sheet on mobile, icon rail when
 * collapsed) with the page content on a raised panel beside it.
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

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_NAV.map((item) => {
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isNavActive(pathname, item.href)}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <HugeiconsIcon icon={NAV_ICONS[item.href]} aria-hidden />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu user={user} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <ShellSidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="font-semibold">Sahihi</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** Same behaviour as coss `SidebarTrigger`, with the HugeIcons glyph the shell uses. */
function ShellSidebarTrigger() {
  const { toggleSidebar } = useSidebar()
  return (
    <Button
      className="-ms-1"
      size="icon-sm"
      variant="ghost"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
    >
      <HugeiconsIcon icon={SidebarLeftIcon} aria-hidden />
    </Button>
  )
}
