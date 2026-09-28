"use client"

import { Building2Icon, ChevronsUpDownIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
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
        <Menu>
          <MenuTrigger
            disabled={pending}
            render={<SidebarMenuButton size="lg" tooltip={active?.name ?? "Workspace"} />}
          >
            <Building2Icon aria-hidden />
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="text-muted-foreground text-xs">Workspace</span>
              <span className="truncate font-medium">{active?.name ?? "Select a workspace"}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" aria-hidden />
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-56">
            <MenuGroup>
              <MenuGroupLabel>Workspaces</MenuGroupLabel>
              <MenuRadioGroup
                value={activeOrganizationId}
                onValueChange={(value) => switchTo(String(value))}
              >
                {organizations.map((o) => (
                  <MenuRadioItem key={o.id} value={o.id}>
                    {o.name}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
            <MenuLinkItem render={<Link href="/onboarding" />}>
              <PlusIcon aria-hidden />
              New workspace
            </MenuLinkItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
