import { describe, expect, test } from "bun:test"
import { formatDate } from "./format"
import {
  bellLabel,
  groupPreferences,
  mergeNewest,
  type NotificationItem,
  timeAgo,
  unreadBadge,
} from "./notifications"

describe("unreadBadge / bellLabel", () => {
  test("hidden at zero, capped past 99", () => {
    expect(unreadBadge(0)).toBeNull()
    expect(unreadBadge(7)).toBe("7")
    expect(unreadBadge(100)).toBe("99+")
    expect(bellLabel(0)).toBe("Notifications")
    expect(bellLabel(3)).toBe("Notifications, 3 unread")
    expect(bellLabel(150)).toBe("Notifications, more than 99 unread")
  })
})

describe("timeAgo", () => {
  const now = new Date("2026-10-07T12:00:00Z")
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  test("short spans in words", () => {
    expect(timeAgo(ago(10_000), now)).toBe("Just now")
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5 min ago")
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3 h ago")
    expect(timeAgo(ago(30 * 3_600_000), now)).toBe("Yesterday")
    expect(timeAgo(ago(4 * 86_400_000), now)).toBe("4 days ago")
  })
  test("a week or more shows the date", () => {
    expect(timeAgo(ago(10 * 86_400_000), now)).toBe(formatDate(ago(10 * 86_400_000)))
  })
  test("clock skew reads as just now", () => {
    expect(timeAgo(new Date(now.getTime() + 5_000), now)).toBe("Just now")
  })
})

describe("mergeNewest", () => {
  const n = (id: string): NotificationItem => ({
    id,
    type: "export.ready",
    envelopeId: null,
    data: {},
    readAt: null,
    createdAt: "2026-10-07T12:00:00Z",
  })
  test("new on top, no duplicates, fresh copies win", () => {
    const fresh = [{ ...n("c") }, { ...n("b"), readAt: "2026-10-07T12:01:00Z" }]
    const merged = mergeNewest([n("b"), n("a")], fresh)
    expect(merged.map((x) => x.id)).toEqual(["c", "b", "a"])
    expect(merged[1]?.readAt).toBe("2026-10-07T12:01:00Z")
  })
})

describe("groupPreferences", () => {
  test("sections in order with catalog labels; empty ones dropped", () => {
    const groups = groupPreferences([
      { type: "envelope.completed", enabled: true },
      { type: "export.ready", enabled: false },
    ])
    expect(groups.map((g) => g.group)).toEqual(["envelopes", "workspace"])
    expect(groups[0]?.items[0]).toMatchObject({ type: "envelope.completed", label: "Completed" })
    expect(groupPreferences([{ type: "export.ready", enabled: true }]).map((g) => g.group)).toEqual(
      ["workspace"],
    )
  })
})
