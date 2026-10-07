"use client"

import { Building03Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
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

  // Arc items are keyed by label, so two workspaces with the same name get a short suffix.
  const seen = new Map<string, number>()
  const items: DropdownItem[] = organizations.map((o) => {
    const n = (seen.get(o.name) ?? 0) + 1
    seen.set(o.name, n)
    const current = o.id === activeOrganizationId
    return {
      label: n > 1 ? `${o.name} (${n})` : o.name,
      // The check marks the active workspace; an empty slot keeps the names aligned.
      icon: current ? <HugeiconsIcon icon={Tick02Icon} size={16} aria-label="Current" /> : <span />,
      disabled: pending || current,
      onSelect: () => void switchTo(o.id),
    }
  })
  items.push({
    label: "New workspace",
    icon: <HugeiconsIcon icon={PlusSignIcon} size={16} />,
    separatorBefore: true,
    onSelect: () => router.push("/onboarding"),
  })

  // The shell hides this in the icon rail, so the trigger always has room for the name.
  return (
    <DropdownMenu
      label={active?.name ?? "Select a workspace"}
      icon={<HugeiconsIcon icon={Building03Icon} size={16} />}
      items={items}
    />
  )
}
