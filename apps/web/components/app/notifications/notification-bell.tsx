"use client"

import { describeNotification } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toastManager } from "@/components/app/toast"
import { NotificationCenter } from "@/components/arc/notification-center/notification-center"
import { api } from "@/lib/api"
import {
  BELL_PAGE_SIZE,
  type CenterItem,
  createActionBatcher,
  NOTIFICATIONS_POLL_MS,
  type NotificationItem,
  type NotificationPage,
  notificationsSignature,
  toCenterItems,
} from "@/lib/notifications"

const ACTION_PATH = {
  read: "/notifications/read",
  unread: "/notifications/unread",
  dismiss: "/notifications/dismiss",
}

/**
 * The bell in the top bar: Arc's notification center (docs/notifications.md) fed from
 * `/api/notifications`. The center keeps its own copy of the list after mount, so the bell polls
 * while the tab is visible and remounts it with the new list when something changed, but never
 * while it's open. Read, unread and dismiss are sent back in batches. An item's "Open" action
 * (ADR 0030) closes the panel, marks it read and goes to its page.
 */
export function NotificationBell() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [seed, setSeed] = useState<{ key: number; items: CenterItem[] }>({ key: 0, items: [] })
  /** What the server has, as last loaded and changed locally since */
  const current = useRef<NotificationItem[]>([])
  /** Signature of what the mounted center shows */
  const shown = useRef("")
  const open = useRef(false)
  const pending = useRef<NotificationItem[] | null>(null)

  const mount = useCallback((items: NotificationItem[]) => {
    current.current = items
    shown.current = notificationsSignature(items)
    setSeed((s) => ({ key: s.key + 1, items: toCenterItems(items) }))
  }, [])

  const load = useCallback(async () => {
    try {
      const page = await api<NotificationPage>(`/notifications?limit=${BELL_PAGE_SIZE}`)
      if (notificationsSignature(page.items) === shown.current) return
      if (open.current) pending.current = page.items
      else mount(page.items)
    } catch {
      // A missed poll is harmless: the next one catches up.
    }
  }, [mount])

  const queue = useMemo(
    () =>
      createActionBatcher(
        (action, ids) => api(ACTION_PATH[action], { method: "POST", json: { ids } }),
        () => {
          toastManager.add({ title: "Couldn't update your notifications", type: "error" })
          // Show the server's state again on the next poll.
          shown.current = ""
        },
      ),
    [],
  )

  useEffect(() => {
    void load()
    const tick = () => {
      if (document.visibilityState === "visible") void load()
    }
    const timer = window.setInterval(tick, NOTIFICATIONS_POLL_MS)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("focus", tick)
    }
  }, [load])

  /** Mirrors the center's own change, so the next poll sees nothing new and doesn't remount it. */
  function changed(items: NotificationItem[]) {
    current.current = items
    shown.current = notificationsSignature(items)
  }

  function onReadChange(item: { id: string }, read: boolean) {
    const readAt = read ? new Date().toISOString() : null
    changed(current.current.map((n) => (n.id === item.id ? { ...n, readAt } : n)))
    queue(read ? "read" : "unread", item.id)
  }

  function onDismiss(item: { id: string }) {
    changed(current.current.filter((n) => n.id !== item.id))
    queue("dismiss", item.id)
  }

  function onOpen(item: { id: string }) {
    const n = current.current.find((x) => x.id === item.id)
    const href = n ? describeNotification(n).href : null
    if (!n || !href) return
    if (!n.readAt) onReadChange(n, true)
    onOpenChange(false)
    // The center still shows it unread: remount it from the local list, which has it read.
    mount(current.current)
    router.push(href)
  }

  function onOpenChange(next: boolean) {
    setIsOpen(next)
    open.current = next
    if (next || !pending.current) return
    const items = pending.current
    pending.current = null
    if (notificationsSignature(items) !== shown.current) mount(items)
  }

  return (
    <NotificationCenter
      key={seed.key}
      notifications={seed.items}
      onReadChange={onReadChange}
      onDismiss={onDismiss}
      onOpen={onOpen}
      open={isOpen}
      onOpenChange={onOpenChange}
    />
  )
}
