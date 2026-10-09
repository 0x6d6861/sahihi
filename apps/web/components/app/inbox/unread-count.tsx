"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { api } from "@/lib/api"
import { NOTIFICATIONS_POLL_MS } from "@/lib/notifications"

interface UnreadCount {
  /** Unread notifications of the signed-in user in the active workspace; null until loaded */
  count: number | null
  /**
   * Reload now, after the Inbox read, unread or dismissed some. Resolves to the new count (null if
   * the request failed or a newer one won), so the caller knows the change was its own.
   */
  refresh: () => Promise<number | null>
}

const UnreadCountContext = createContext<UnreadCount>({
  count: null,
  refresh: async () => null,
})

/**
 * The Inbox badge in the top bar (docs/notifications.md → Inbox): polls the unread count every
 * minute while the tab is visible, and on focus. A workspace switch starts it over. The Inbox page
 * calls `refresh` after its own changes so the badge follows at once. Polls are skipped while a
 * request is in flight (focus and visibilitychange often fire together), and only the newest
 * request's answer is applied.
 */
export function UnreadCountProvider({
  workspaceId,
  children,
}: {
  workspaceId: string
  children: React.ReactNode
}) {
  const [count, setCount] = useState<number | null>(null)
  const latest = useRef(0)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    const id = ++latest.current
    inFlight.current = true
    try {
      const r = await api<{ count: number }>("/notifications/unread-count")
      if (id !== latest.current) return null
      setCount(r.count)
      return r.count
    } catch {
      // A missed poll is harmless: the next one catches up.
      return null
    } finally {
      if (id === latest.current) inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void workspaceId
    setCount(null)
    void refresh()
    const tick = () => {
      if (document.visibilityState === "visible" && !inFlight.current) void refresh()
    }
    const timer = window.setInterval(tick, NOTIFICATIONS_POLL_MS)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", tick)
      window.removeEventListener("focus", tick)
    }
  }, [refresh, workspaceId])

  const value = useMemo(() => ({ count, refresh }), [count, refresh])
  return <UnreadCountContext value={value}>{children}</UnreadCountContext>
}

export function useUnreadCount() {
  return useContext(UnreadCountContext)
}
