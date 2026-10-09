import type { ActivityGroup, DocumentPeriod, NotificationType } from "@sahihi/core"

/**
 * The Inbox's search and filters (ADR 0041, docs/notifications.md → Inbox). Notifications and
 * workspace activity are filtered by the API; the short bulk-send list is filtered here.
 */

export interface NotificationFilters {
  q?: string
  status?: "unread" | "read"
  type?: NotificationType
  period?: DocumentPeriod
}

export interface ActivityFilters {
  q?: string
  group?: Exclude<ActivityGroup, "all">
  actor?: string
  period?: DocumentPeriod
}

/** Whether any search or chip is set (shows "No matches" instead of "Nothing yet"). */
export const hasInboxFilters = (f: NotificationFilters | ActivityFilters | BulkSendFilters) =>
  Object.values(f).some((v) => v !== undefined && v !== "")

/** Query string for `GET /api/notifications`, without the leading "?". */
export function notificationsQuery(f: NotificationFilters, limit: number, cursor?: string | null) {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (cursor) qs.set("cursor", cursor)
  if (f.status === "unread") qs.set("unread", "1")
  if (f.status === "read") qs.set("read", "1")
  if (f.type) qs.set("type", f.type)
  if (f.period) qs.set("period", f.period)
  if (f.q) qs.set("q", f.q)
  return qs.toString()
}

/** Query string for `GET /api/activity`, without the leading "?". */
export function activityQuery(f: ActivityFilters, cursor?: string | null) {
  const qs = new URLSearchParams({ group: f.group ?? "all" })
  if (cursor) qs.set("cursor", cursor)
  if (f.actor) qs.set("actor", f.actor)
  if (f.period) qs.set("period", f.period)
  if (f.q) qs.set("q", f.q)
  return qs.toString()
}

export const BULK_SEND_STATES = ["running", "done", "failures"] as const
export type BulkSendState = (typeof BULK_SEND_STATES)[number]

export const BULK_SEND_STATE_LABEL: Record<BulkSendState, string> = {
  running: "In progress",
  done: "Finished",
  failures: "With failures",
}

export interface BulkSendFilters {
  q?: string
  state?: BulkSendState
}

/** Bulk sends matching a search over title and template, and a state. */
export function filterBulkSends<
  T extends { title: string; template: string; done: boolean; failed: number },
>(rows: readonly T[], f: BulkSendFilters): T[] {
  const q = f.q?.trim().toLowerCase()
  return rows.filter((r) => {
    if (q && !`${r.title} ${r.template}`.toLowerCase().includes(q)) return false
    if (f.state === "running") return !r.done
    if (f.state === "done") return r.done
    if (f.state === "failures") return r.failed > 0
    return true
  })
}
