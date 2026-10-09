import { describe, expect, test } from "bun:test"
import { activityQuery, filterBulkSends, hasInboxFilters, notificationsQuery } from "./inbox"

describe("notificationsQuery", () => {
  test("only what's set", () => {
    expect(notificationsQuery({}, 50)).toBe("limit=50")
    expect(
      notificationsQuery(
        { q: "lease", status: "read", type: "recipient.signed", period: "7d" },
        50,
        "123.abc",
      ),
    ).toBe("limit=50&cursor=123.abc&read=1&type=recipient.signed&period=7d&q=lease")
    expect(notificationsQuery({ status: "unread" }, 20)).toBe("limit=20&unread=1")
  })
})

describe("activityQuery", () => {
  test("group defaults to all", () => {
    expect(activityQuery({})).toBe("group=all")
    expect(activityQuery({ group: "signing", actor: "u1", period: "30d", q: "a b" }, "c")).toBe(
      "group=signing&cursor=c&actor=u1&period=30d&q=a+b",
    )
  })
})

describe("filterBulkSends", () => {
  const rows = [
    { title: "March payslips", template: "Payslip", done: true, failed: 0 },
    { title: "Offer letters", template: "Offer", done: false, failed: 0 },
    { title: "NDAs", template: "Mutual NDA", done: true, failed: 2 },
  ]
  test("search over title and template, any case", () => {
    expect(filterBulkSends(rows, { q: "PAYSLIP" }).map((r) => r.title)).toEqual(["March payslips"])
    expect(filterBulkSends(rows, { q: "mutual" }).map((r) => r.title)).toEqual(["NDAs"])
  })
  test("state", () => {
    expect(filterBulkSends(rows, { state: "running" }).map((r) => r.title)).toEqual([
      "Offer letters",
    ])
    expect(filterBulkSends(rows, { state: "done" })).toHaveLength(2)
    expect(filterBulkSends(rows, { state: "failures" }).map((r) => r.title)).toEqual(["NDAs"])
    expect(filterBulkSends(rows, {})).toHaveLength(3)
  })
})

test("hasInboxFilters", () => {
  expect(hasInboxFilters({})).toBe(false)
  expect(hasInboxFilters({ q: "" })).toBe(false)
  expect(hasInboxFilters({ period: "7d" })).toBe(true)
})
