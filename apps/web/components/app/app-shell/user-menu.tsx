"use client"

import { ChevronsUpDownIcon, LogOutIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { initials } from "@/lib/nav"

export interface ShellUser {
  name: string
  email: string
  image?: string | null
}

export function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter()

  async function onSignOut() {
    await signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger render={<SidebarMenuButton size="lg" tooltip={user.email} />}>
            <Avatar className="size-8">
              {user.image && <AvatarImage src={user.image} alt="" />}
              <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col gap-0.5 leading-none">
              <span className="truncate font-medium">{user.name || user.email}</span>
              <span className="truncate text-muted-foreground text-xs">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto" aria-hidden />
          </MenuTrigger>
          <MenuPopup align="start" side="top" className="min-w-56">
            <MenuItem onClick={onSignOut}>
              <LogOutIcon aria-hidden />
              Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
