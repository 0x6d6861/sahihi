"use client"

import { Building03Icon, PlusSignIcon, UnfoldMoreIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { toastManager } from "@/components/ui/toast"
import { organization } from "@/lib/auth-client"

export interface ShellOrganization {
  id: string
  name: string
}

/**
 * Workspace switcher. Changing the active org updates the session on the API, then
 * sends the user to /documents: the current page may belong to the previous org.
 */
export function OrgSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: ShellOrganization[]
  activeOrganizationId: string
}) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const [pending, setPending] = useState(false)
  const active = organizations.find((o) => o.id === activeOrganizationId)

  async function switchTo(organizationId: string) {
    if (organizationId === activeOrganizationId) return
    setPending(true)
    const { error } = await organization.setActive({ organizationId })
    setPending(false)
    if (error) {
      toastManager.add({
        title: "Could not switch workspace",
        description: error.message,
        type: "error",
      })
      return
    }
    router.push("/documents")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={pending}
            render={<SidebarMenuButton size="lg" tooltip={active?.name ?? "Workspace"} />}
          >
            <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <HugeiconsIcon icon={Building03Icon} className="size-4" aria-hidden />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="text-muted-foreground text-xs">Workspace</span>
              <span className="truncate font-medium">{active?.name ?? "Select a workspace"}</span>
            </div>
            <HugeiconsIcon icon={UnfoldMoreIcon} className="ml-auto" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? "bottom" : "right"}
            className="min-w-56"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activeOrganizationId}
                onValueChange={(value) => switchTo(String(value))}
              >
                {organizations.map((o) => (
                  <DropdownMenuRadioItem key={o.id} value={o.id}>
                    {o.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/onboarding" />}>
              <HugeiconsIcon icon={PlusSignIcon} aria-hidden />
              New workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
