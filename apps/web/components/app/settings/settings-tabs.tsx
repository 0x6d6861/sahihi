"use client"

import { usePathname, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { SETTINGS_NAV as TABS } from "@/lib/nav"

/** Settings sub-navigation. Each tab is its own page, so choosing one navigates. */
export function SettingsTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const current = TABS.find((t) => pathname.startsWith(t.href))?.href ?? TABS[0].href
  return (
    <Tabs value={current} onValueChange={(v) => router.push(String(v))}>
      <TabsList aria-label="Settings">
        {TABS.map((t) => (
          <TabsTrigger key={t.href} value={t.href}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
