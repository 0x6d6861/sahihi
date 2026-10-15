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
 * The Inbox badge in the top bar (docs/notifications.md → Inbox). The API pushes the unread count
 * over a stream (ADR 0057). While the stream is down, it polls every minute while the tab is
 * visible, and on focus, and tries to reopen the stream. A workspace switch starts it over. The
 * Inbox page calls `refresh` after its own changes so the badge follows at once. Polls are skipped
 * while a request is in flight (focus and visibilitychange often fire together), and only the
 * newest request's answer is applied, and not if a stream event arrived since it started.
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
  const pushed = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++latest.current
    const pushedAtStart = pushed.current
    inFlight.current = true
    try {
      const r = await api<{ count: number }>("/notifications/unread-count")
      // A count pushed over the stream since this request started is newer than its answer.
      if (id !== latest.current || pushedAtStart !== pushed.current) return null
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
    let stream: EventSource | null = null
    const open = () => {
      stream = new EventSource("/api/notifications/stream")
      stream.addEventListener("count", (e) => {
        try {
          const { count } = JSON.parse((e as MessageEvent<string>).data) as { count: number }
          pushed.current++
          setCount(count)
        } catch {
          // A malformed event is ignored: the next signal or poll catches up.
        }
      })
    }
    open()
    const tick = () => {
      if (document.visibilityState !== "visible" || stream?.readyState === EventSource.OPEN) return
      // The browser retries a dropped stream itself, but gives up on an error response.
      if (stream?.readyState === EventSource.CLOSED) open()
      if (!inFlight.current) void refresh()
    }
    const timer = window.setInterval(tick, NOTIFICATIONS_POLL_MS)
    document.addEventListener("visibilitychange", tick)
    window.addEventListener("focus", tick)
    return () => {
      stream?.close()
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
