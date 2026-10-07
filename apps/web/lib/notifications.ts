import { NOTIFICATION_CATALOG, type NotificationGroup, type NotificationType } from "@sahihi/core"
import { formatDate } from "./format"

/**
 * Helpers for the bell and Settings → Notifications (docs/notifications.md). Titles and links come
 * from `describeNotification` in @sahihi/core so the API and the web agree.
 */

/** How often the bell asks for the unread count while the tab is visible. */
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

/** The badge text: nothing at zero, "99+" past 99. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null
  return count > 99 ? "99+" : String(count)
}

/** Accessible name for the bell button. */
export function bellLabel(count: number): string {
  if (count <= 0) return "Notifications"
  return `Notifications, ${count > 99 ? "more than 99" : count} unread`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then the date. */
export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const then = value instanceof Date ? value : new Date(value)
  const ms = now.getTime() - then.getTime()
  if (ms < MINUTE) return "Just now"
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min ago`
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`
  if (ms < 2 * DAY) return "Yesterday"
  if (ms < 7 * DAY) return `${Math.floor(ms / DAY)} days ago`
  return formatDate(then)
}

/** Merges a newer first page into what's loaded: new items on top, no duplicates. */
export function mergeNewest(
  loaded: readonly NotificationItem[],
  fresh: readonly NotificationItem[],
): NotificationItem[] {
  const seen = new Set(fresh.map((n) => n.id))
  return [...fresh, ...loaded.filter((n) => !seen.has(n.id))]
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
