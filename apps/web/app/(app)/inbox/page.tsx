import Link from "next/link"
import { ActivityFeed, type ActivityPage } from "@/components/app/inbox/activity-feed"
import { BulkSendsPanel } from "@/components/app/inbox/bulk-sends-panel"
import { InboxTabs } from "@/components/app/inbox/inbox-tabs"
import { NotificationList } from "@/components/app/inbox/notification-list"
import { apiServer } from "@/lib/api-server"
import { formatDate } from "@/lib/format"
import { INBOX_PAGE_SIZE, type NotificationPage } from "@/lib/notifications"

export const metadata = { title: "Inbox" }

interface BulkSendListItem {
  id: string
  title: string
  status: "PENDING" | "RUNNING" | "DONE"
  total: number
  sent: number
  failed: number
  createdAt: string
  template: { name: string } | null
}

/**
 * What's happening in the active workspace (ADR 0041, docs/notifications.md → Inbox): your
 * notifications, every envelope's activity, and recent bulk sends. Replaces the bell.
 */
export default async function InboxPage() {
  const [notifications, activity, bulk] = await Promise.all([
    apiServer<NotificationPage>(`/notifications?limit=${INBOX_PAGE_SIZE}`),
    apiServer<ActivityPage>("/activity"),
    apiServer<{ items: BulkSendListItem[] }>("/bulk-sends"),
  ])
  const batches = (bulk.data?.items ?? []).slice(0, 25)
  // One clock for both lists' time labels, so the client's first render matches.
  const now = Date.now()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-medium text-2xl tracking-tight">Inbox</h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          What recipients did with your envelopes, everything happening in this workspace, and your
          bulk sends. Choose what you're told about in{" "}
          <Link href="/settings/notifications" className="underline underline-offset-4">
            Settings → Notifications
          </Link>
          .
        </p>
      </header>
      <InboxTabs
        panels={{
          notifications: (
            <NotificationList
              initial={notifications.data ?? { items: [], nextCursor: null, unreadCount: 0 }}
              now={now}
            />
          ),
          activity: (
            <ActivityFeed
              initial={activity.data ?? { items: [], nextCursor: null, people: [] }}
              now={now}
            />
          ),
          "bulk-sends": (
            <BulkSendsPanel
              rows={batches.map((b) => ({
                id: b.id,
                template: b.template?.name ?? "Deleted template",
                title: b.title,
                sent: b.sent,
                total: b.total,
                failed: b.failed,
                done: b.status === "DONE",
                startedAt: b.createdAt,
                startedLabel: formatDate(new Date(b.createdAt)),
              }))}
            />
          ),
        }}
      />
    </div>
  )
}
