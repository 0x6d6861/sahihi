import { NOTIFICATION_CATALOG, type NotificationGroup, type NotificationType } from "@sahihi/core"
import { formatDate } from "./format"

/**
 * Helpers for the Inbox (its unread badge and notification list) and Settings → Notifications
 * (docs/notifications.md). Titles, text and tones come from `describeNotification` in @sahihi/core.
 */

/** How often the Inbox badge reloads the unread count while the tab is visible. */
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

/** How many the Inbox loads at a time ("Load more" fetches the next page; the API's maximum). */
export const INBOX_PAGE_SIZE = 50

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Compact age for the Inbox's time labels: "now", "5m", "3h", "2d", then the date. */
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

/** `items` with those ids marked read (keeping an earlier `readAt`) or unread. */
export function withReadState(
  items: readonly NotificationItem[],
  ids: readonly string[],
  read: boolean,
  now: Date = new Date(),
): NotificationItem[] {
  const set = new Set(ids)
  return items.map((n) => {
    if (!set.has(n.id)) return n
    if (read) return n.readAt ? n : { ...n, readAt: now.toISOString() }
    return n.readAt ? { ...n, readAt: null } : n
  })
}

/** Ids in chunks of 100, the API's limit per request. */
function chunk(ids: readonly string[]): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))
  return chunks
}

/** "Clear read": the ids of the read ones, in chunks of 100 (the API's limit per request). */
export function readIdsToClear(items: readonly NotificationItem[]): string[][] {
  return chunk(items.filter((n) => n.readAt).map((n) => n.id))
}

/**
 * "Mark all read" while a search or filter is set: only the unread ones shown, in chunks of 100.
 * Without one, the Inbox sends `{ all: true }` instead, which also covers those not loaded yet.
 */
export function unreadIdsToMark(items: readonly NotificationItem[]): string[][] {
  return chunk(items.filter((n) => !n.readAt).map((n) => n.id))
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
