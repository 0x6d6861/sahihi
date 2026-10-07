"use client"

import { describeNotification } from "@sahihi/core"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { BellIcon, SettingsIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { Button as ArcButton } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import {
  bellLabel,
  mergeNewest,
  NOTIFICATIONS_POLL_MS,
  type NotificationItem,
  type NotificationPage,
  timeAgo,
  unreadBadge,
} from "@/lib/notifications"

/**
 * The bell in the top bar (docs/notifications.md). Polls the unread count while the tab is
 * visible; opening it loads the newest page. Choosing an item marks it read and opens its page.
 */
export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[] | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const refreshCount = useCallback(async () => {
    try {
      const { count } = await api<{ count: number }>("/notifications/unread-count")
      setUnread(count)
    } catch {
      // A missed poll is harmless: the next one catches up.
    }
  }, [])

  const loadNewest = useCallback(async () => {
    try {
      const page = await api<NotificationPage>("/notifications")
      setItems((loaded) => (loaded ? mergeNewest(loaded, page.items) : page.items))
      setNextCursor((cursor) => cursor ?? page.nextCursor)
      setUnread(page.unreadCount)
    } catch {
      setItems((loaded) => loaded ?? [])
    }
  }, [])

  useEffect(() => {
    void refreshCount()
    const tick = () => {
      if (document.visibilityState === "visible") void refreshCount()
    }
    const timer = window.setInterval(tick, NOTIFICATIONS_POLL_MS)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("focus", tick)
    }
  }, [refreshCount])

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) void loadNewest()
  }

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await api<NotificationPage>(
        `/notifications?cursor=${encodeURIComponent(nextCursor)}`,
      )
      setItems((loaded) => [...(loaded ?? []), ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      toastManager.add({ title: "Couldn't load more notifications", type: "error" })
    } finally {
      setLoadingMore(false)
    }
  }

  /** `ids` must be unread ones: the badge drops by their count. */
  function markLocally(ids: string[] | "all") {
    const now = new Date().toISOString()
    setItems((loaded) =>
      (loaded ?? []).map((n) =>
        n.readAt || (ids !== "all" && !ids.includes(n.id)) ? n : { ...n, readAt: now },
      ),
    )
    setUnread((count) => (ids === "all" ? 0 : Math.max(0, count - ids.length)))
  }

  async function markAllRead() {
    markLocally("all")
    try {
      await api("/notifications/read", { method: "POST", json: { all: true } })
    } catch {
      toastManager.add({ title: "Couldn't mark notifications as read", type: "error" })
      void refreshCount()
    }
  }

  function choose(n: NotificationItem, href: string | null) {
    if (!n.readAt) {
      markLocally([n.id])
      void api("/notifications/read", { method: "POST", json: { ids: [n.id] } }).catch(() =>
        refreshCount(),
      )
    }
    if (href) {
      setOpen(false)
      router.push(href)
    }
  }

  const badge = unreadBadge(unread)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={bellLabel(unread)} className="relative">
          <BellIcon aria-hidden />
          {badge && (
            <span className="pointer-events-none absolute -top-2 -right-2.5" aria-hidden>
              <Badge size="sm" tone="danger">
                {badge}
              </Badge>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem]" aria-label="Notifications">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium text-sm">Notifications</h2>
            {unread > 0 && (
              <ArcButton variant="ghost" size="sm" onClick={markAllRead}>
                Mark all read
              </ArcButton>
            )}
          </div>

          {items === null ? (
            <p className="py-6 text-center text-muted-foreground text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BellIcon />}
              title="You're all caught up"
              description="We'll let you know when recipients sign, decline or finish."
            />
          ) : (
            <ul className="-mx-2 flex max-h-[min(26rem,60vh)] flex-col overflow-y-auto">
              {items.map((n) => (
                <NotificationRow key={n.id} item={n} onChoose={choose} />
              ))}
              {nextCursor && (
                <li className="flex justify-center pt-2">
                  <ArcButton variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>
                    Show older
                  </ArcButton>
                </li>
              )}
            </ul>
          )}

          <div className="border-t pt-3">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md text-muted-foreground text-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SettingsIcon aria-hidden />
              Notification settings
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationRow({
  item,
  onChoose,
}: {
  item: NotificationItem
  onChoose: (item: NotificationItem, href: string | null) => void
}) {
  const view = describeNotification(item)
  const unread = !item.readAt
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(item, view.href)}
        className="flex w-full gap-3 rounded-lg px-2 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex w-2 shrink-0 justify-center pt-1.5" aria-hidden>
          {/* Arc's brand accent, like the logo mark: the one coloured cue in the list. */}
          {unread && (
            <span className="size-2 rounded-full" style={{ background: "var(--accent)" }} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={unread ? "font-medium text-sm" : "text-sm"}>
            {unread && <span className="sr-only">Unread: </span>}
            {view.title}
          </span>
          {view.body && (
            <span className="line-clamp-2 text-muted-foreground text-sm">{view.body}</span>
          )}
          <time dateTime={item.createdAt} className="text-muted-foreground text-xs">
            {timeAgo(item.createdAt)}
          </time>
        </span>
      </button>
    </li>
  )
}
