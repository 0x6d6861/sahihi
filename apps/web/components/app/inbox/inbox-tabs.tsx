"use client"

import { useSearchParamState } from "@/components/app/use-search-param"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs"
import { useUnreadCount } from "./unread-count"

export const INBOX_TABS = ["notifications", "activity", "bulk-sends"] as const
export type InboxTab = (typeof INBOX_TABS)[number]

const LABELS: Record<InboxTab, string> = {
  notifications: "Notifications",
  activity: "Workspace activity",
  "bulk-sends": "Bulk sends",
}

function isTab(v: string | null): v is InboxTab {
  return INBOX_TABS.includes(v as InboxTab)
}

/**
 * Notifications / Workspace activity / Bulk sends (ADR 0041), switched through `?tab=` so a reload
 * or a link (`/inbox?tab=bulk-sends`) lands on the same one. Notifications shows the unread count.
 */
export function InboxTabs({ panels }: { panels: Record<InboxTab, React.ReactNode> }) {
  const [tab, setTab] = useSearchParamState("tab", (raw) => (isTab(raw) ? raw : "notifications"))
  const { count } = useUnreadCount()
  return (
    <Tabs value={tab} onValueChange={(v) => isTab(v) && setTab(v)}>
      <TabsList aria-label="Inbox">
        {INBOX_TABS.map((t) => (
          <TabsTrigger key={t} value={t}>
            {LABELS[t]}
            {t === "notifications" && count ? (
              <span className="ms-1.5 text-muted-foreground tabular-nums">{count}</span>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {INBOX_TABS.map((t) => (
        <TabsContent key={t} value={t} className="pt-4">
          {panels[t]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
