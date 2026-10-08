import { describe, expect, test } from "bun:test"
import { formatDate } from "./format"
import {
  applyLocalChanges,
  createActionBatcher,
  groupPreferences,
  isMarkAll,
  mergeBellPages,
  type NotificationAction,
  type NotificationItem,
  notificationsSignature,
  openLabelFor,
  pendingLocalChanges,
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
  const now = new Date("2026-10-07T12:00:30Z")
  test("changes with new items, order and read state, not with data", () => {
    const base = notificationsSignature([n("a"), n("b")], now)
    expect(notificationsSignature([n("a"), n("b"), n("c")], now)).not.toBe(base)
    expect(notificationsSignature([n("a", { readAt: "x" }), n("b")], now)).not.toBe(base)
    expect(notificationsSignature([n("a", { data: { envelopeCount: 9 } }), n("b")], now)).toBe(base)
  })
  test("changes when a time label moves on, so the bell doesn't stay on 'now'", () => {
    const later = new Date("2026-10-07T12:06:00Z")
    expect(notificationsSignature([n("a")], later)).not.toBe(notificationsSignature([n("a")], now))
  })
})

describe("mergeBellPages", () => {
  test("one list, newest first, no duplicates", () => {
    const merged = mergeBellPages(
      [n("old-unread", { createdAt: "2026-09-01T00:00:00Z" }), n("b")],
      [n("b"), n("c", { createdAt: "2026-10-07T13:00:00Z" })],
    )
    expect(merged.map((x) => x.id)).toEqual(["c", "b", "old-unread"])
  })
})

describe("local changes", () => {
  const now = new Date("2026-10-07T12:00:00Z")
  test("applied on top of the server's list", () => {
    const shown = applyLocalChanges(
      [n("a"), n("b"), n("c", { readAt: "2026-10-07T11:00:00Z" })],
      new Map([
        ["a", "read"],
        ["b", "dismiss"],
        ["c", "unread"],
      ]),
      now,
    )
    expect(shown.map((x) => [x.id, x.readAt])).toEqual([
      ["a", now.toISOString()],
      ["c", null],
    ])
  })
  test("a poll that predates the change doesn't undo it", () => {
    // The user marked A read and dismissed B; the poll's list was fetched before either landed.
    const changes = new Map<string, NotificationAction>([
      ["a", "read"],
      ["b", "dismiss"],
    ])
    const stale = [n("a"), n("b")]
    const pending = pendingLocalChanges(stale, changes)
    expect([...pending]).toEqual([
      ["a", "read"],
      ["b", "dismiss"],
    ])
    expect(applyLocalChanges(stale, pending, now).map((x) => [x.id, x.readAt])).toEqual([
      ["a", now.toISOString()],
    ])
  })
  test("forgotten once the server shows them", () => {
    const changes = new Map<string, NotificationAction>([
      ["a", "read"],
      ["b", "dismiss"],
      ["c", "unread"],
    ])
    const fresh = [n("a", { readAt: "2026-10-07T12:00:01Z" }), n("c")]
    expect(pendingLocalChanges(fresh, changes).size).toBe(0)
  })
})

describe("isMarkAll", () => {
  test("several reads covering every loaded unread one", () => {
    expect(isMarkAll(["a", "b"], ["a", "b"])).toBe(true)
    expect(isMarkAll(["a", "b", "c"], ["a", "b"])).toBe(true)
  })
  test("not a single toggle or a partial batch", () => {
    expect(isMarkAll(["a"], ["a"])).toBe(false)
    expect(isMarkAll(["a", "b"], ["a", "b", "c"])).toBe(false)
    expect(isMarkAll(["a", "b"], [])).toBe(false)
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
      (_err, action, ids) => errors.push([action, ids]),
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

  test("failures are reported with their ids and the batch goes on", async () => {
    const { queue, sent, errors, flush } = setup(true)
    queue("read", "a")
    queue("dismiss", "b")
    await flush()
    expect(sent).toHaveLength(2)
    expect(errors).toEqual([
      ["read", ["a"]],
      ["dismiss", ["b"]],
    ])
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
