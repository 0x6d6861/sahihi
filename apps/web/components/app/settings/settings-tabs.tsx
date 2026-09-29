"use client"

import { usePathname, useRouter } from "next/navigation"
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"

const TABS = [
  { href: "/settings/members", label: "Members" },
  { href: "/settings/webhooks", label: "Webhooks" },
  { href: "/settings/billing", label: "Plan & usage" },
  { href: "/settings/data", label: "Data" },
  { href: "/settings/api", label: "API" },
] as const

/** Settings sub-navigation. Each tab is its own page, so choosing one navigates. */
export function SettingsTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const current = TABS.find((t) => pathname.startsWith(t.href))?.href ?? TABS[0].href
  return (
    <Tabs value={current} onValueChange={(v) => router.push(String(v))}>
      <TabsList>
        {TABS.map((t) => (
          <TabsTab key={t.href} value={t.href}>
            {t.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}
