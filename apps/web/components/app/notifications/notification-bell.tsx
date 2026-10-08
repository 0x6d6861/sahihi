"use client"

import { describeNotification } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toastManager } from "@/components/app/toast"
import { NotificationCenter } from "@/components/arc/notification-center/notification-center"
import { api } from "@/lib/api"
import {
  applyLocalChanges,
  BELL_PAGE_SIZE,
  type CenterItem,
  createActionBatcher,
  isMarkAll,
  mergeBellPages,
  NOTIFICATIONS_POLL_MS,
  type NotificationAction,
  type NotificationItem,
  type NotificationPage,
  notificationsSignature,
  pendingLocalChanges,
  toCenterItems,
} from "@/lib/notifications"

const ACTION_PATH = {
  read: "/notifications/read",
  unread: "/notifications/unread",
  dismiss: "/notifications/dismiss",
}

/**
 * The bell in the top bar: Arc's notification center (docs/notifications.md) fed from
 * `/api/notifications`. The center keeps its own copy of the list after mount, so the bell keeps
 * two things: the server's list (polled while the tab is visible) and the changes made in the bell
 * that the server hasn't shown back yet. What it shows is always the first with the second on top,
 * so a poll that raced a change can't undo it. It remounts the center with that list when it
 * differs from what's shown, but never while it's open.
 *
 * Read, unread and dismiss go back in batches; the center's "Mark all read" goes as `{ all: true }`.
 * An item's "Open" action (ADR 0030) closes the panel, marks it read and goes to its page.
 */
export function NotificationBell() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [seed, setSeed] = useState<{ key: number; items: CenterItem[] }>({ key: 0, items: [] })
  /** The server's list, as last loaded */
  const server = useRef<NotificationItem[]>([])
  /** Changes made here that `server` doesn't show yet */
  const changes = useRef(new Map<string, NotificationAction>())
  /** Signature of what the mounted center shows */
  const shown = useRef("")
  const open = useRef(false)

  const visible = useCallback(
    (now: Date) => applyLocalChanges(server.current, changes.current, now),
    [],
  )

  /** Remounts the center with the current list when it differs from what it shows. */
  const refresh = useCallback(
    (force = false) => {
      const now = new Date()
      const items = visible(now)
      const signature = notificationsSignature(items, now)
      if (!force && signature === shown.current) return
      shown.current = signature
      setSeed((s) => ({ key: s.key + 1, items: toCenterItems(items, now) }))
    },
    [visible],
  )

  const load = useCallback(async () => {
    try {
      const limit = `limit=${BELL_PAGE_SIZE}`
      const [unread, recent] = await Promise.all([
        api<NotificationPage>(`/notifications?unread=1&${limit}`),
        api<NotificationPage>(`/notifications?${limit}`),
      ])
      server.current = mergeBellPages(unread.items, recent.items)
      changes.current = pendingLocalChanges(server.current, changes.current)
      if (!open.current) refresh()
    } catch {
      // A missed poll is harmless: the next one catches up.
    }
  }, [refresh])

  const queue = useMemo(
    () =>
      createActionBatcher(
        (action, ids) => {
          const unreadIds = server.current.filter((n) => !n.readAt).map((n) => n.id)
          if (action === "read" && isMarkAll(ids, unreadIds)) {
            return api(ACTION_PATH.read, { method: "POST", json: { all: true } })
          }
          return api(ACTION_PATH[action], { method: "POST", json: { ids } })
        },
        (_err, action, ids) => {
          toastManager.add({ title: "Couldn't update your notifications", type: "error" })
          // Those changes didn't happen: show the server's state again once the panel closes.
          for (const id of ids) if (changes.current.get(id) === action) changes.current.delete(id)
          if (!open.current) refresh()
        },
      ),
    [refresh],
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

  /** Records a change the center already shows, so nothing remounts it for that alone. */
  function record(id: string, action: NotificationAction) {
    changes.current.set(id, action)
    shown.current = notificationsSignature(visible(new Date()))
    queue(action, id)
  }

  function onReadChange(item: { id: string }, read: boolean) {
    record(item.id, read ? "read" : "unread")
  }

  function onDismiss(item: { id: string }) {
    record(item.id, "dismiss")
  }

  function onOpenChange(next: boolean) {
    setIsOpen(next)
    open.current = next
    // Polls that arrived while it was open, and time labels that moved on, show now.
    if (!next) refresh()
  }

  function onOpen(item: { id: string }) {
    const n = server.current.find((x) => x.id === item.id)
    const href = n ? describeNotification(n).href : null
    if (!n || !href) return
    const read = changes.current.get(n.id) === "read" || (!changes.current.has(n.id) && n.readAt)
    if (!read) record(n.id, "read")
    setIsOpen(false)
    open.current = false
    // The center itself still shows it unread (it wasn't marked from its own button).
    refresh(true)
    router.push(href)
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
