import {
  describeNotification,
  NOTIFICATION_CATALOG,
  type NotificationGroup,
  type NotificationType,
} from "@sahihi/core"
import { formatDate } from "./format"

/**
 * Helpers for the bell (Arc's notification center) and Settings → Notifications
 * (docs/notifications.md). Titles, text and tones come from `describeNotification` in @sahihi/core.
 */

/** How often the bell reloads its list while the tab is visible. */
export const NOTIFICATIONS_POLL_MS = 60_000

export interface NotificationItem {
  id: string
  type: string
  envelopeId: string | null
  data: unknown
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: NotificationItem[]
  nextCursor: string | null
  unreadCount: number
}

export interface NotificationPreference {
  type: NotificationType
  enabled: boolean
}

/** How many the bell loads. Arc's notification center keeps them all in memory (no paging). */
export const BELL_PAGE_SIZE = 50

/** The item shape of Arc's `NotificationCenter` (components/arc/notification-center). */
export interface CenterItem {
  id: string
  title: string
  description: string
  time: string
  read: boolean
  tone: "info" | "success" | "warning"
  /** The open action's text (ADR 0030); absent when there's nowhere to go */
  openLabel?: string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact age for the bell's time column: "now", "5m", "3h", "2d", then the date. */
export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value)
  const ms = now.getTime() - then.getTime()
  if (ms < MINUTE) return "now"
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)}m`
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h`
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)}d`
  return formatDate(then)
}

/** The open action's text for a notification's page (ADR 0030). */
export function openLabelFor(href: string | null): string | undefined {
  if (!href) return undefined
  if (href.startsWith("/envelopes/")) return "Open envelope"
  if (href.startsWith("/bulk-sends/")) return "Open bulk send"
  if (href === "/settings/data") return "Open Data settings"
  if (href === "/settings/members") return "Open Members"
  if (href === "/settings/billing") return "Open Plan & usage"
  return "Open"
}

/** Our notifications as Arc notification center items (text and tone from @sahihi/core). */
export function toCenterItems(
  items: readonly NotificationItem[],
  now: Date = new Date(),
): CenterItem[] {
  return items.map((n) => {
    const view = describeNotification(n)
    return {
      id: n.id,
      title: view.title,
      description: view.body,
      time: timeAgo(n.createdAt, now),
      read: n.readAt !== null,
      tone: view.tone,
      ...(view.href ? { openLabel: openLabelFor(view.href) } : {}),
    }
  })
}

/**
 * What the bell shows, as a comparable string: ids in order, read state and the time labels. The
 * notification center only takes its list on mount, so the bell remounts it (while closed) when
 * this changes, which also moves "now" on to "5m".
 */
export function notificationsSignature(
  items: readonly NotificationItem[],
  now: Date = new Date(),
): string {
  return items.map((n) => `${n.id}:${n.readAt ? 1 : 0}:${timeAgo(n.createdAt, now)}`).join(",")
}

/** The bell's list: unread ones first loaded on their own, so old unread ones aren't cut off. */
export function mergeBellPages(...pages: (readonly NotificationItem[])[]): NotificationItem[] {
  const byId = new Map<string, NotificationItem>()
  for (const page of pages) for (const n of page) byId.set(n.id, n)
  return [...byId.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}

export type NotificationAction = "read" | "unread" | "dismiss"

/** Changes made in the bell that the server hasn't shown back yet, by notification id. */
export type LocalChanges = ReadonlyMap<string, NotificationAction>

/** The server's list with the bell's own changes on top: what the bell shows. */
export function applyLocalChanges(
  items: readonly NotificationItem[],
  changes: LocalChanges,
  now: Date = new Date(),
): NotificationItem[] {
  if (changes.size === 0) return [...items]
  const out: NotificationItem[] = []
  for (const n of items) {
    const change = changes.get(n.id)
    if (change === "dismiss") continue
    if (change === "read") out.push(n.readAt ? n : { ...n, readAt: now.toISOString() })
    else if (change === "unread") out.push({ ...n, readAt: null })
    else out.push(n)
  }
  return out
}

/** The changes the server's list doesn't reflect yet; the rest are done and can be forgotten. */
export function pendingLocalChanges(
  items: readonly NotificationItem[],
  changes: LocalChanges,
): Map<string, NotificationAction> {
  const byId = new Map(items.map((n) => [n.id, n]))
  const pending = new Map<string, NotificationAction>()
  for (const [id, change] of changes) {
    const n = byId.get(id)
    const done =
      change === "dismiss"
        ? !n
        : // Gone from the list (dismissed elsewhere or past the page): nothing left to show.
          !n || (change === "read" ? n.readAt !== null : n.readAt === null)
    if (!done) pending.set(id, change)
  }
  return pending
}

/**
 * Whether a batch of "read" ids is the center's "Mark all read": several ids at once that cover
 * every unread notification loaded (single toggles arrive one per tick). The bell then sends
 * `{ all: true }`, which also covers unread ones older than the loaded list.
 */
export function isMarkAll(readIds: readonly string[], unreadIds: readonly string[]): boolean {
  if (readIds.length < 2 || unreadIds.length === 0) return false
  const read = new Set(readIds)
  return unreadIds.every((id) => read.has(id))
}

/**
 * Collects the notification center's per-item callbacks ("Mark all read" calls back once per
 * item) and sends one request per action on the next tick, in chunks of 100 (the API's limit).
 * A later read/unread for the same id replaces the earlier one.
 */
export function createActionBatcher(
  send: (action: NotificationAction, ids: string[]) => Promise<unknown>,
  /** A request failed: those ids' changes didn't happen. */
  onError: (err: unknown, action: NotificationAction, ids: string[]) => void,
  schedule: (flush: () => void) => void = (flush) => {
    setTimeout(flush, 0)
  },
) {
  const queues: Record<NotificationAction, Set<string>> = {
    read: new Set(),
    unread: new Set(),
    dismiss: new Set(),
  }
  let scheduled = false

  async function flush() {
    scheduled = false
    for (const action of ["read", "unread", "dismiss"] as const) {
      const ids = [...queues[action]]
      queues[action].clear()
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        try {
          await send(action, chunk)
        } catch (err) {
          onError(err, action, chunk)
        }
      }
    }
  }

  return (action: NotificationAction, id: string) => {
    if (action === "read") queues.unread.delete(id)
    if (action === "unread") queues.read.delete(id)
    queues[action].add(id)
    if (!scheduled) {
      scheduled = true
      schedule(() => void flush())
    }
  }
}

export const PREFERENCE_GROUPS: readonly {
  group: NotificationGroup
  title: string
  description: string
}[] = [
  {
    group: "envelopes",
    title: "Your envelopes",
    description: "What recipients do with the envelopes and bulk sends you created.",
  },
  {
    group: "workspace",
    title: "Workspace",
    description: "Exports you asked for and, for owners and admins, the workspace itself.",
  },
]

/** Preferences split into the settings page's sections, empty sections dropped. */
export function groupPreferences(items: readonly NotificationPreference[]) {
  return PREFERENCE_GROUPS.map((g) => ({
    ...g,
    items: items
      .filter((i) => NOTIFICATION_CATALOG[i.type]?.group === g.group)
      .map((i) => ({ ...i, ...NOTIFICATION_CATALOG[i.type] })),
  })).filter((g) => g.items.length > 0)
}
