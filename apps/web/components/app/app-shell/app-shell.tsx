"use client"

import { FileTextIcon, LayoutTemplateIcon, SendIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { APP_NAV, type AppNavHref, isNavActive } from "@/lib/nav"
import { OrgSwitcher, type ShellOrganization } from "./org-switcher"
import { type ShellUser, UserMenu } from "./user-menu"

const NAV_ICONS: Record<AppNavHref, React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  "/documents": FileTextIcon,
  "/envelopes": SendIcon,
  "/templates": LayoutTemplateIcon,
  "/settings/members": UsersIcon,
}

/** Authenticated app shell: coss Sidebar (sheet on mobile) + inset content area. */
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
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <OrgSwitcher organizations={organizations} activeOrganizationId={activeOrganizationId} />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_NAV.map((item) => {
                  const Icon = NAV_ICONS[item.href]
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isNavActive(pathname, item.href)}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <Icon aria-hidden />
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
          <SidebarTrigger aria-label="Toggle sidebar" />
          <Separator orientation="vertical" className="h-4" />
          <span className="font-semibold">Sahihi</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
