import { describe, expect, test } from "bun:test"
import { formatDate } from "./format"
import {
  groupPreferences,
  type NotificationItem,
  openLabelFor,
  readIdsToClear,
  timeAgo,
  unreadIdsToMark,
  withReadState,
} from "./notifications"

const n = (id: string, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  type: "export.ready",
  envelopeId: null,
  data: {},
  readAt: null,
  createdAt: "2026-10-07T12:00:00Z",
  ...over,
})

describe("timeAgo", () => {
  const now = new Date("2026-10-07T12:00:00Z")
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  test("compact spans", () => {
    expect(timeAgo(ago(10_000), now)).toBe("now")
    expect(timeAgo(ago(5 * 60_000), now)).toBe("5m")
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe("3h")
    expect(timeAgo(ago(30 * 3_600_000), now)).toBe("1d")
    expect(timeAgo(ago(4 * 86_400_000), now)).toBe("4d")
  })
  test("a week or more shows the date", () => {
    expect(timeAgo(ago(10 * 86_400_000), now)).toBe(formatDate(ago(10 * 86_400_000)))
  })
  test("clock skew reads as now", () => {
    expect(timeAgo(new Date(now.getTime() + 5_000), now)).toBe("now")
  })
})

describe("openLabelFor", () => {
  test("names the destination", () => {
    expect(openLabelFor("/envelopes/e1")).toBe("Open envelope")
    expect(openLabelFor("/bulk-sends/b1")).toBe("Open bulk send")
    expect(openLabelFor("/settings/data")).toBe("Open Data settings")
    expect(openLabelFor("/settings/members")).toBe("Open Members")
    expect(openLabelFor("/settings/billing")).toBe("Open Plan & usage")
    expect(openLabelFor("/somewhere")).toBe("Open")
    expect(openLabelFor(null)).toBeUndefined()
  })
})

describe("withReadState", () => {
  const now = new Date("2026-10-08T09:00:00Z")
  const earlier = "2026-10-07T13:00:00Z"
  test("marks read, keeping an earlier readAt", () => {
    const items = [n("a"), n("b", { readAt: earlier }), n("c")]
    expect(withReadState(items, ["a", "b"], true, now).map((i) => i.readAt)).toEqual([
      now.toISOString(),
      earlier,
      null,
    ])
  })
  test("marks unread and leaves the rest as they were", () => {
    const items = [n("a", { readAt: earlier }), n("b", { readAt: earlier })]
    const next = withReadState(items, ["a"], false, now)
    expect(next.map((i) => i.readAt)).toEqual([null, earlier])
    expect(next[1]).toBe(items[1] as NotificationItem)
  })
})

describe("readIdsToClear", () => {
  test("only read ones, in chunks of 100", () => {
    const items = Array.from({ length: 205 }, (_, i) =>
      n(`n${i}`, { readAt: i === 0 ? null : "2026-10-07T13:00:00Z" }),
    )
    const chunks = readIdsToClear(items)
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 4])
    expect(chunks.flat()).not.toContain("n0")
    expect(readIdsToClear([n("a")])).toEqual([])
  })
})

describe("unreadIdsToMark", () => {
  test("only unread ones, in chunks of 100", () => {
    const items = Array.from({ length: 150 }, (_, i) =>
      n(`n${i}`, { readAt: i < 20 ? "2026-10-07T13:00:00Z" : null }),
    )
    const chunks = unreadIdsToMark(items)
    expect(chunks.map((c) => c.length)).toEqual([100, 30])
    expect(chunks.flat()).not.toContain("n0")
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
