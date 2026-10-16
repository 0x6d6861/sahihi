"use client"

import {
  CreditCardIcon,
  PlusSignIcon,
  Settings02Icon,
  Tick02Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { organization } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"

export interface ShellOrganization {
  id: string
  name: string
}

/** Settings that belong to the active workspace, reachable from its own menu (ADR 0054). */
const WORKSPACE_LINKS = [
  { label: "Workspace settings", href: "/settings/workspace", icon: Settings02Icon },
  { label: "Members", href: "/settings/members", icon: UserGroupIcon },
  { label: "Plan & usage", href: "/settings/billing", icon: CreditCardIcon },
] as const

/**
 * Workspace menu: switch workspace, open the active workspace's settings, or create one.
 * Changing the active org updates the session on the API, then sends the user home: the
 * current page may belong to the previous org.
 */
export function OrgSwitcher({
  organizations,
  activeOrganizationId,
  activeIcon,
}: {
  organizations: ShellOrganization[]
  activeOrganizationId: string
  /** The active workspace's website icon (Settings → Workspace); other workspaces show none. */
  activeIcon: string | null
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
    router.push(HOME_HREF)
    router.refresh()
  }

  // Arc items are keyed by label, so two workspaces with the same name get a short suffix. The
  // fixed items are seeded so a workspace called "Members" can't collide with the link.
  const seen = new Map<string, number>(
    [...WORKSPACE_LINKS.map((l) => l.label), "New workspace"].map((label) => [label, 1]),
  )
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
  for (const [i, link] of WORKSPACE_LINKS.entries()) {
    items.push({
      label: link.label,
      icon: <HugeiconsIcon icon={link.icon} size={16} />,
      separatorBefore: i === 0,
      onSelect: () => router.push(link.href),
    })
  }
  items.push({
    label: "New workspace",
    icon: <HugeiconsIcon icon={PlusSignIcon} size={16} />,
    separatorBefore: true,
    onSelect: () => router.push("/onboarding"),
  })

  // The shell hides this in the icon rail, so the trigger always has room for the name.
  return (
    <span className="app-plain-trigger contents">
      <DropdownMenu
        align="start"
        label={active?.name ?? "Select a workspace"}
        icon={<WorkspaceMark name={active?.name ?? ""} icon={activeIcon} />}
        items={items}
      />
    </span>
  )
}

/**
 * The active workspace's website icon, or its initials on a small emerald square as in the top
 * bar of the design (also when the icon fails to load).
 */
function WorkspaceMark({ name, icon }: { name: string; icon: string | null }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (icon && failed !== icon) {
    return (
      // biome-ignore lint/performance/noImgElement: same-origin icon route, fixed size
      <img
        src={icon}
        alt=""
        aria-hidden
        className="on-paper size-5.5 rounded-md border bg-background object-contain p-0.5"
        onError={() => setFailed(icon)}
      />
    )
  }
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "W"
  return (
    <span
      aria-hidden
      className="grid size-5.5 place-items-center rounded-md bg-primary font-medium text-primary-foreground text-xs"
    >
      {initials}
    </span>
  )
}
