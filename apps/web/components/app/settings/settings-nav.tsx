"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { SETTINGS_GROUPS, SETTINGS_NAV } from "@/lib/nav"
import { cn } from "@/lib/utils"

/**
 * Settings side nav (wide screens, ADR 0055): the pages grouped under Account and Workspace, the
 * current one on a muted fill. Narrow screens use `SettingsTabs`. Arc has no vertical nav (its
 * settings blocks are Pro), so this composes links with theme tokens, like `PillNav`.
 */
export function SettingsNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Settings" className="flex flex-col gap-6">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p
            id={`settings-nav-${group.id}`}
            className="truncate px-3 pb-1 text-muted-foreground text-xs"
          >
            {group.label}
          </p>
          <ul aria-labelledby={`settings-nav-${group.id}`} className="flex flex-col gap-0.5">
            {SETTINGS_NAV.filter((item) => item.group === group.id).map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-lg px-3 text-sm outline-none transition-colors duration-(--duration-instant) ease-(--ease-standard) focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground [@media(hover:hover)]:hover:bg-muted/60 [@media(hover:hover)]:hover:text-foreground",
                    )}
                  >
                    {"navLabel" in item ? item.navLabel : item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
