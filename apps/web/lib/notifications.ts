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
    }
  })
}

/**
 * What the bell shows, as a comparable string: ids in order plus read state. The notification
 * center only takes its list on mount, so the bell remounts it when this changes.
 */
export function notificationsSignature(items: readonly NotificationItem[]): string {
  return items.map((n) => `${n.id}:${n.readAt ? 1 : 0}`).join(",")
}

export type NotificationAction = "read" | "unread" | "dismiss"

/**
 * Collects the notification center's per-item callbacks ("Mark all read" calls back once per
 * item) and sends one request per action on the next tick, in chunks of 100 (the API's limit).
 * A later read/unread for the same id replaces the earlier one.
 */
export function createActionBatcher(
  send: (action: NotificationAction, ids: string[]) => Promise<unknown>,
  onError: (err: unknown) => void,
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
        try {
          await send(action, ids.slice(i, i + 100))
        } catch (err) {
          onError(err)
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
