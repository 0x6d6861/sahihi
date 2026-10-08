import { describe, expect, test } from "bun:test"
import { formatDate } from "./format"
import {
  createActionBatcher,
  groupPreferences,
  type NotificationAction,
  type NotificationItem,
  notificationsSignature,
  openLabelFor,
  timeAgo,
  toCenterItems,
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

describe("toCenterItems", () => {
  test("text, tone, time and read state", () => {
    const now = new Date("2026-10-07T12:05:00Z")
    const [item] = toCenterItems(
      [
        n("a", {
          type: "envelope.completed",
          envelopeId: "e1",
          data: { envelopeTitle: "NDA" },
          readAt: "2026-10-07T12:01:00Z",
        }),
      ],
      now,
    )
    expect(item).toEqual({
      id: "a",
      title: "“NDA” is complete",
      description: "Everyone has signed. The signed PDF and certificate are ready.",
      time: "5m",
      read: true,
      tone: "success",
      openLabel: "Open envelope",
    })
  })
  test("no open action without a page", () => {
    const [item] = toCenterItems([n("a", { type: "recipient.signed", envelopeId: null })])
    expect(item?.openLabel).toBeUndefined()
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

describe("notificationsSignature", () => {
  test("changes with new items, order and read state only", () => {
    const base = notificationsSignature([n("a"), n("b")])
    expect(notificationsSignature([n("a"), n("b"), { ...n("c") }])).not.toBe(base)
    expect(notificationsSignature([n("a", { readAt: "x" }), n("b")])).not.toBe(base)
    expect(notificationsSignature([n("a", { data: { envelopeCount: 9 } }), n("b")])).toBe(base)
  })
})

describe("createActionBatcher", () => {
  function setup(fail = false) {
    const sent: [NotificationAction, string[]][] = []
    const errors: unknown[] = []
    let pending: (() => void) | null = null
    const queue = createActionBatcher(
      async (action, ids) => {
        sent.push([action, ids])
        if (fail) throw new Error("offline")
      },
      (err) => errors.push(err),
      (flush) => {
        pending = flush
      },
    )
    const flush = async () => {
      pending?.()
      pending = null
      await new Promise((r) => setTimeout(r, 0))
    }
    return { queue, sent, errors, flush }
  }

  test("one request per action for a burst of callbacks", async () => {
    const { queue, sent, flush } = setup()
    queue("read", "a")
    queue("read", "b")
    queue("dismiss", "c")
    await flush()
    expect(sent).toEqual([
      ["read", ["a", "b"]],
      ["dismiss", ["c"]],
    ])
  })

  test("the last read/unread for an id wins", async () => {
    const { queue, sent, flush } = setup()
    queue("read", "a")
    queue("unread", "a")
    await flush()
    expect(sent).toEqual([["unread", ["a"]]])
  })

  test("chunks of 100", async () => {
    const { queue, sent, flush } = setup()
    for (let i = 0; i < 150; i++) queue("read", `n${i}`)
    await flush()
    expect(sent.map(([, ids]) => ids.length)).toEqual([100, 50])
  })

  test("failures are reported and the batch goes on", async () => {
    const { queue, sent, errors, flush } = setup(true)
    queue("read", "a")
    queue("dismiss", "b")
    await flush()
    expect(sent).toHaveLength(2)
    expect(errors).toHaveLength(2)
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
