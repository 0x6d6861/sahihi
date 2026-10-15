"use client"

import {
  DOCUMENT_PERIODS,
  describeNotification,
  NOTIFICATION_CATALOG,
  NOTIFICATION_TYPES,
  type NotificationType,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/app/button"
import {
  BellIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  MailIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { ListSearch, type SearchChip } from "@/components/app/list-search"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { api } from "@/lib/api"
import { PERIOD_LABEL } from "@/lib/documents-list"
import { formatDateTime, formatTime } from "@/lib/format"
import { groupByDay } from "@/lib/group-by-day"
import { hasInboxFilters, type NotificationFilters, notificationsQuery } from "@/lib/inbox"
import {
  INBOX_PAGE_SIZE,
  type NotificationItem,
  type NotificationPage,
  openLabelFor,
  readIdsToClear,
  unreadIdsToMark,
  withReadState,
} from "@/lib/notifications"
import { cn } from "@/lib/utils"
import { NotificationIcon } from "./notification-icon"
import { useUnreadCount } from "./unread-count"

const TYPE_OPTIONS = NOTIFICATION_TYPES.map((type, i) => ({
  value: type,
  label: NOTIFICATION_CATALOG[type].label,
  // Envelope events, then workspace ones.
  separatorBefore:
    i > 0 &&
    NOTIFICATION_CATALOG[type].group !==
      NOTIFICATION_CATALOG[NOTIFICATION_TYPES[i - 1] as NotificationType].group,
}))

function filterChips(f: NotificationFilters): SearchChip[] {
  return [
    {
      id: "status",
      label: "Status",
      any: "Read and unread",
      current: f.status,
      options: [
        { value: "unread", label: "Unread" },
        { value: "read", label: "Read" },
      ],
    },
    { id: "type", label: "Type", any: "Any type", current: f.type, options: TYPE_OPTIONS },
    {
      id: "period",
      label: "Date",
      any: "Any time",
      current: f.period,
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
  ]
}

/**
 * The Inbox's notifications (docs/notifications.md → Inbox): yours, in the active workspace, newest
 * first, 50 at a time with "Load more", narrowed by a search (names and titles) and Status / Type /
 * Date chips, all applied by the API. Read, unread and dismiss show at once and go to the API;
 * a failure puts the list back as the server has it. The top bar's badge is refreshed after each
 * change, and the first page reloads when the badge goes up for another reason (something new
 * arrived). Only the newest list request's answer is shown, so a slow page can't land on top of a
 * newer search. Times count from `now`, the server render's clock, so hydration matches, then
 * move on every minute.
 */
export function NotificationList({
  initial,
  now: serverNow,
}: {
  initial: NotificationPage
  now: number
}) {
  const router = useRouter()
  const unread = useUnreadCount()
  const [filters, setFilters] = useState<NotificationFilters>({})
  const [items, setItems] = useState(initial.items)
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(serverNow)
  /** The badge's count last seen here: when it goes up, something new arrived */
  const lastCount = useRef<number | null>(null)
  /** Changes made here whose badge refresh hasn't come back yet: their count changes are ours */
  const ownChanges = useRef(0)
  /** The newest list request; older answers are dropped */
  const latest = useRef(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const load = useCallback(async (f: NotificationFilters) => {
    const id = ++latest.current
    setLoading(true)
    try {
      const page = await api<NotificationPage>(
        `/notifications?${notificationsQuery(f, INBOX_PAGE_SIZE)}`,
      )
      if (id !== latest.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
    } catch {
      if (id === latest.current) {
        toastManager.add({ title: "Couldn't load your notifications", type: "error" })
      }
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, [])

  // New notifications arrived (the badge went up, and not from a change made here): show them.
  useEffect(() => {
    if (unread.count === null) return
    const before = lastCount.current ?? initial.unreadCount
    lastCount.current = unread.count
    if (ownChanges.current === 0 && unread.count > before) void load(filters)
  }, [unread.count, filters, load, initial.unreadCount])

  function applyFilters(next: NotificationFilters) {
    setFilters(next)
    void load(next)
  }

  async function loadMore() {
    if (!nextCursor) return
    const id = ++latest.current
    setLoading(true)
    try {
      const page = await api<NotificationPage>(
        `/notifications?${notificationsQuery(filters, INBOX_PAGE_SIZE, nextCursor)}`,
      )
      if (id !== latest.current) return
      setItems((current) => [
        ...current,
        ...page.items.filter((n) => !current.some((c) => c.id === n.id)),
      ])
      setNextCursor(page.nextCursor)
    } catch {
      if (id === latest.current) {
        toastManager.add({ title: "Couldn't load more notifications", type: "error" })
      }
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }

  /** Shows `next` now, sends the request, then refreshes the badge; on failure reloads the list. */
  async function change(next: NotificationItem[], request: () => Promise<unknown>) {
    setItems(next)
    ownChanges.current += 1
    try {
      await request()
    } catch {
      toastManager.add({ title: "Couldn't update your notifications", type: "error" })
      void load(filters)
    } finally {
      const count = await unread.refresh()
      if (count !== null) lastCount.current = count
      ownChanges.current -= 1
    }
  }

  const filtered = hasInboxFilters(filters)
  const post = (path: string, json: unknown) => api(path, { method: "POST", json })

  function setRead(n: NotificationItem, read: boolean) {
    void change(withReadState(items, [n.id], read), () =>
      post(read ? "/notifications/read" : "/notifications/unread", { ids: [n.id] }),
    )
  }

  function dismiss(n: NotificationItem) {
    void change(
      items.filter((i) => i.id !== n.id),
      () => post("/notifications/dismiss", { ids: [n.id] }),
    )
  }

  /** Everything unread, or with a search or filter set only the unread ones shown. */
  function markAllRead() {
    const chunks = filtered ? unreadIdsToMark(items) : []
    void change(
      withReadState(
        items,
        items.map((n) => n.id),
        true,
      ),
      async () => {
        if (!filtered) return post("/notifications/read", { all: true })
        for (const ids of chunks) await post("/notifications/read", { ids })
      },
    )
  }

  function clearRead() {
    const chunks = readIdsToClear(items)
    const cleared = new Set(chunks.flat())
    void change(
      items.filter((n) => !cleared.has(n.id)),
      async () => {
        for (const ids of chunks) await post("/notifications/dismiss", { ids })
      },
    )
  }

  function open(n: NotificationItem, href: string) {
    if (!n.readAt) setRead(n, true)
    router.push(href)
  }

  const hasUnread = items.some((n) => !n.readAt)
  const hasRead = items.some((n) => n.readAt)
  const onlyUnread =
    filters.status === "unread" && !hasInboxFilters({ ...filters, status: undefined })

  return (
    <div className="flex flex-col gap-4">
      <ListSearch
        label="Search notifications"
        placeholder="Search by envelope, recipient or member"
        query={filters.q ?? ""}
        onQueryChange={(q) => applyFilters({ ...filters, q })}
        chips={filterChips(filters)}
        onChipChange={(id, value) => applyFilters({ ...filters, [id]: value })}
        onClearChips={() => applyFilters({ q: filters.q })}
        pending={loading}
        actions={
          <Button variant="ghost" size="sm" disabled={!hasUnread} onClick={markAllRead}>
            <CheckIcon aria-hidden />
            {filtered ? "Mark these read" : "Mark all read"}
          </Button>
        }
      />
      <Panel className="gap-0 overflow-hidden p-0">
        {items.length === 0 ? (
          <EmptyState
            className="md:py-10"
            icon={<BellIcon aria-hidden />}
            title={
              filtered
                ? onlyUnread
                  ? "You're all caught up"
                  : "No matching notifications"
                : "Nothing here yet"
            }
            description={
              filtered
                ? "Try another search or clear the filters."
                : "When recipients sign, decline or an envelope completes, you'll see it here."
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => applyFilters({})}>
                  Clear search and filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div aria-busy={loading} className="divide-y">
            {groupByDay(items, (n) => n.createdAt, new Date(now)).map((group) => (
              <section key={group.key} aria-label={group.label} className="divide-y">
                <h3 className="bg-muted/50 px-5 py-2.5 font-medium text-muted-foreground text-xs">
                  {group.label}
                </h3>
                <ul className="divide-y">
                  {group.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onOpen={open}
                      onSetRead={setRead}
                      onDismiss={dismiss}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="flex justify-center border-t px-4 py-3">
            <Button variant="ghost" size="sm" loading={loading} onClick={() => void loadMore()}>
              Load more
            </Button>
          </div>
        )}
      </Panel>
      {(items.length > 0 || !filtered) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          {/* The badge's count, so you know where you stand. */}
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {filtered ? null : unread.count ? `${unread.count} unread` : "All read"}
          </p>
          <Button variant="ghost" size="sm" disabled={!hasRead} onClick={clearRead}>
            <Trash2Icon aria-hidden />
            Clear read notifications
          </Button>
        </div>
      )}
    </div>
  )
}

/** One notification: unread dot, type mark, title and body, the time, an open button and ⋮. */
function NotificationRow({
  n,
  onOpen,
  onSetRead,
  onDismiss,
}: {
  n: NotificationItem
  onOpen: (n: NotificationItem, href: string) => void
  onSetRead: (n: NotificationItem, read: boolean) => void
  onDismiss: (n: NotificationItem) => void
}) {
  const view = describeNotification(n)
  const isUnread = !n.readAt
  return (
    <li className="flex items-center gap-3.5 px-5 py-4">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          // One colour means unread, as on the Inbox count; green and amber mean status.
          isUnread ? "bg-info" : "bg-transparent",
        )}
      />
      <NotificationIcon type={n.type} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cn("text-sm", isUnread ? "font-medium" : "text-muted-foreground")}>
          {isUnread && <span className="sr-only">Unread: </span>}
          {view.title}
        </p>
        {view.body && <p className="text-muted-foreground text-sm">{view.body}</p>}
      </div>
      <time
        dateTime={n.createdAt}
        title={formatDateTime(n.createdAt)}
        className="shrink-0 text-muted-foreground text-sm tabular-nums"
      >
        {formatTime(n.createdAt)}
      </time>
      <div className="flex shrink-0 items-center gap-1">
        {view.href && (
          <span className="max-sm:hidden">
            <Button variant="secondary" size="sm" onClick={() => onOpen(n, view.href as string)}>
              {openLabelFor(view.href)}
            </Button>
          </span>
        )}
        <DropdownMenu
          label={`Actions for “${view.title}”`}
          iconOnly
          icon={<EllipsisVerticalIcon />}
          items={[
            ...(view.href
              ? [
                  {
                    label: openLabelFor(view.href) ?? "Open",
                    icon: <FileTextIcon />,
                    onSelect: () => onOpen(n, view.href as string),
                  },
                ]
              : []),
            {
              label: isUnread ? "Mark read" : "Mark unread",
              icon: isUnread ? <CheckIcon /> : <MailIcon />,
              onSelect: () => onSetRead(n, isUnread),
            },
            {
              label: "Dismiss",
              icon: <Trash2Icon />,
              destructive: true,
              separatorBefore: true,
              onSelect: () => onDismiss(n),
            },
          ]}
        />
      </div>
    </li>
  )
}
